import { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import { useRouter } from "next/router";
import * as faceapi from "@vladmandic/face-api";

const CHALLENGE_META = {
  blink: {
    label: "Blink",
    instruction: "Look straight at the camera and BLINK once",
    statusText: "Looking for a natural blink (open → closed → open)...",
  },
  left: {
    label: "Turn Left",
    instruction: "Face the camera, then TURN YOUR HEAD LEFT",
    statusText: "Face forward first, then turn toward your LEFT shoulder...",
  },
  right: {
    label: "Turn Right",
    instruction: "Face the camera, then TURN YOUR HEAD RIGHT",
    statusText: "Face forward first, then turn toward your RIGHT shoulder...",
  },
  smile: {
    label: "Smile",
    instruction: "Keep a neutral face, then SMILE",
    statusText: "Neutral face first, then smile...",
  },
};

const titleFor = (order, idx) =>
  `ANTI-SPOOF CHECK (${idx + 1}/${order.length}): ${CHALLENGE_META[order[idx]].instruction}`;

const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const DETECT_WIDTH = 480;
const LUMA_SAMPLE = 24;
const MIN_FACE_LUMA = 80;

// Client thresholds are slightly stricter than the server's so borderline bursts aren't wasted round-trips.
const NEUTRAL_YAW = [0.85, 1.2];
const BLINK_MAX_MS = 1300;
const NEUTRAL_MAX_AGE_MS = 3500;
const NEUTRAL_MIN_AGE_MS = 150;
const FACE_LOCK_HOLD_MS = 1200;
const FACE_LOCK_MIN_SCORE = 0.6;
const FACE_LOCK_MIN_FRAC = 0.18;
const FACE_LOCK_MAX_FRAC = 0.65;
const FACE_LOCK_MAX_JITTER = 0.08;
const STEP_TRANSITION_BUFFER_MS = 500;

function computeClientMetrics(landmarks, expressions) {
  const pts = landmarks.positions;
  const leftEAR = (dist(pts[37], pts[41]) + dist(pts[38], pts[40])) / (2.0 * dist(pts[36], pts[39]));
  const rightEAR = (dist(pts[43], pts[47]) + dist(pts[44], pts[46])) / (2.0 * dist(pts[42], pts[45]));
  const ear = (leftEAR + rightEAR) / 2.0;

  const noseTip = pts[30];
  const dLeft = dist(noseTip, pts[1]);
  const dRight = dist(noseTip, pts[15]);
  const yaw = dLeft / (dRight + 1e-6);

  const smile = dist(pts[48], pts[54]) / (dist(pts[3], pts[13]) + 1e-6);
  const happy = expressions?.happy || 0;

  return { ear, yaw, smile, happy };
}

export default function RegisterDoctor() {
  const router = useRouter();

  const [step, setStep] = useState(1); // 1:Identity, 2:Liveness/Verify, 3:Password

  // User Data
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Verification & Liveness State
  const [challengeOrder, setChallengeOrder] = useState([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [statusBanner, setStatusBanner] = useState("");
  const [bottomStatus, setBottomStatus] = useState("");
  const [spoofWarning, setSpoofWarning] = useState("");
  const [liveTelemetry, setLiveTelemetry] = useState("");

  // UI Flags
  const [loading, setLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState("");
  const [isLive, setIsLive] = useState(false);

  // Refs for real-time loop
  const webcamRef = useRef(null);
  const sessionIdRef = useRef(null);
  const challengeOrderRef = useRef([]);
  const challengeIdxRef = useRef(0);
  const stepStartedRef = useRef(0);
  const stepTimeoutRef = useRef(25000);
  const registrationTokenRef = useRef(null);

  // Camera selection (lets you pick DroidCam / external webcams) + face brightness meter
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState("");
  const [faceLuma, setFaceLuma] = useState(null);

  const handleUserMedia = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
    } catch (e) {
      console.error("Camera enumeration failed:", e);
    }
  };

  const videoConstraints = cameraId
    ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } };

  // 1. LOAD AI MODELS IN BROWSER
  useEffect(() => {
    const loadBrowserModels = async () => {
      const MODEL_URL = "/models";
      setStatusBanner("Loading AI models...");
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStatusBanner("");
        console.log("[Browser AI] Models loaded successfully");
      } catch (e) {
        setError("Error loading AI models from public/models.");
        console.error("Model loading error:", e);
      }
    };
    loadBrowserModels();
  }, []);

  // 2. IDENTITY CHECK (Step 1)
  const handleCheckIdentity = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/checkDoctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, doctorName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      registrationTokenRef.current = null;
      setIsLive(false);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. SERVER-DRIVEN LIVENESS LOOP WHEN STEP 2 OPENS
  useEffect(() => {
    if (step !== 2 || !modelsLoaded || isLive) return;

    let cancelled = false;

    const startSession = async () => {
      setStatusBanner("Face locked. Starting secure liveness session...");
      const res = await fetch("/api/startLiveness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, doctorName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start liveness session.");

      sessionIdRef.current = data.sessionId;
      challengeOrderRef.current = data.challenges;
      challengeIdxRef.current = 0;
      stepTimeoutRef.current = data.windowMs;
      stepStartedRef.current = performance.now();
      setChallengeOrder(data.challenges);
      setChallengeIndex(0);
      setCompletedSteps([]);
      setStatusBanner(titleFor(data.challenges, 0));
      setBottomStatus(CHALLENGE_META[data.challenges[0]].statusText);
    };

    const runDetectionLoop = async () => {
      // Camera warm-up and face alignment are deliberately client-only. No session, rate-limit
      // slot, or 10-second clock exists until the face has been stable and ready.
      setStatusBanner("Starting camera...");
      setBottomStatus("Allow camera access and choose your camera. The timer has not started.");

      // rawCanvas = untouched pixels (sent to server for PAD — MiniFASNet must see real sensor texture).
      // detectCanvas = downscaled + contrast-boosted copy used ONLY for fast client-side landmark tracking.
      const rawCanvas = document.createElement("canvas");
      const rawCtx = rawCanvas.getContext("2d");
      const detectCanvas = document.createElement("canvas");
      const detectCtx = detectCanvas.getContext("2d");
      const startCanvas = document.createElement("canvas");
      const startCtx = startCanvas.getContext("2d");
      const peakCanvas = document.createElement("canvas");
      const peakCtx = peakCanvas.getContext("2d");
      const lumaCanvas = document.createElement("canvas");
      lumaCanvas.width = LUMA_SAMPLE;
      lumaCanvas.height = LUMA_SAMPLE;
      const lumaCtx = lumaCanvas.getContext("2d", { willReadFrequently: true });

      // Client detection is only a trigger hint; the server re-detects at the strict 0.50 confidence.
      const trackerOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

      // startT = time of the last "before" frame (eyes open / neutral face) held in startCanvas.
      let startT = null;
      let blinkDip = null;
      let baselineEar = null;
      let lastChallengeId = null;
      let frameCount = 0;
      let networkFailures = 0;
      const MAX_NETWORK_FAILURES = 3;
      let lockSince = null;
      let lastLockCenter = null;
      let transitionUntil = 0;

      const resetGestureState = () => {
        startT = null;
        blinkDip = null;
        baselineEar = null;
      };

      while (!cancelled) {
        const video = webcamRef.current?.video;
        if (!video || video.readyState < 2 || !video.videoWidth) {
          await sleep(100);
          continue;
        }

        try {
          const challengeId = sessionIdRef.current ? challengeOrderRef.current[challengeIdxRef.current] : null;
          const meta = challengeId ? CHALLENGE_META[challengeId] : null;
          if (challengeId && challengeId !== lastChallengeId) {
            resetGestureState();
            lastChallengeId = challengeId;
          }

          if (challengeId && performance.now() - stepStartedRef.current > stepTimeoutRef.current) {
            setSpoofWarning("Challenge timed out. Please try again when ready.");
            setBottomStatus("The liveness session ended. Click Try again to start a fresh session.");
            break;
          }

          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const scale = Math.min(1, DETECT_WIDTH / vw);
          const dw = Math.round(vw * scale);
          const dh = Math.round(vh * scale);
          if (rawCanvas.width !== vw || rawCanvas.height !== vh) {
            rawCanvas.width = startCanvas.width = peakCanvas.width = vw;
            rawCanvas.height = startCanvas.height = peakCanvas.height = vh;
            detectCanvas.width = dw;
            detectCanvas.height = dh;
          }

          rawCtx.drawImage(video, 0, 0, vw, vh);
          const now = performance.now();
          detectCtx.filter = "contrast(1.25) brightness(1.2)";
          detectCtx.drawImage(rawCanvas, 0, 0, dw, dh);
          detectCtx.filter = "none";

          // Expressions net is only needed for the smile step — skipping it roughly halves frame time.
          const baseTask = faceapi.detectSingleFace(detectCanvas, trackerOptions).withFaceLandmarks();
          const detection = challengeId === "smile" ? await baseTask.withFaceExpressions() : await baseTask;

          if (cancelled) break;

          if (!detection) {
            setLiveTelemetry("No face detected — sit slightly back so your whole head is visible");
            await nextFrame();
            continue;
          }

          frameCount++;
          const metrics = computeClientMetrics(detection.landmarks, detection.expressions);
          const box = detection.detection.box;
          const faceFrac = box.width / dw;
          const center = { x: (box.x + box.width / 2) / dw, y: (box.y + box.height / 2) / dh };
          const jitter = lastLockCenter ? Math.hypot(center.x - lastLockCenter.x, center.y - lastLockCenter.y) : 0;
          lastLockCenter = center;

          if (!challengeId) {
            const ready = detection.detection.score >= FACE_LOCK_MIN_SCORE &&
              faceFrac >= FACE_LOCK_MIN_FRAC && faceFrac <= FACE_LOCK_MAX_FRAC &&
              metrics.yaw >= NEUTRAL_YAW[0] && metrics.yaw <= NEUTRAL_YAW[1] &&
              metrics.ear >= 0.2 && jitter <= FACE_LOCK_MAX_JITTER;
            setLiveTelemetry(`Face ${Math.round(detection.detection.score * 100)}% | Yaw ${metrics.yaw.toFixed(2)} | Light check after lock`);
            if (!ready) {
              lockSince = null;
              setFaceLuma(luma);
              setBottomStatus("Look straight at the camera, keep both eyes open, and hold still.");
              await nextFrame();
              continue;
            }
            if (lockSince === null) lockSince = performance.now();
            const progress = Math.min(1, (performance.now() - lockSince) / FACE_LOCK_HOLD_MS);
            setBottomStatus(progress < 1 ? "Face found — hold still..." : "Face locked. Starting secure session...");
            if (progress < 1) {
              await nextFrame();
              continue;
            }
            try {
              await startSession();
            } catch (e) {
              setError(e.message);
              break;
            }
            transitionUntil = performance.now() + STEP_TRANSITION_BUFFER_MS;
            continue;
          }

          if (performance.now() < transitionUntil) {
            await sleep(50);
            continue;
          }

          if (frameCount % 10 === 1) {
            const b = detection.detection.box;
            lumaCtx.drawImage(rawCanvas, b.x / scale, b.y / scale, b.width / scale, b.height / scale, 0, 0, LUMA_SAMPLE, LUMA_SAMPLE);
            const px = lumaCtx.getImageData(0, 0, LUMA_SAMPLE, LUMA_SAMPLE).data;
            let sum = 0;
            for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            setFaceLuma(Math.round(sum / (px.length / 4)));
          }

          const secondsLeft = Math.max(0, Math.ceil((stepTimeoutRef.current - (now - stepStartedRef.current)) / 1000));
          setLiveTelemetry(
            "Face Locked ✓ (" +
              Math.round(detection.detection.score * 100) +
              "%) | EAR: " +
              metrics.ear.toFixed(2) +
              " | Yaw: " +
              metrics.yaw.toFixed(2) +
              " | Smile: " +
              Math.round(metrics.happy * 100) +
              "% | " +
              secondsLeft +
              "s left"
          );

          // Every gesture is captured as a short burst that proves MOVEMENT, not a single pose.
          let burst = null;
          if (challengeId === "blink") {
            if (baselineEar === null) baselineEar = metrics.ear;
            const isOpen = metrics.ear >= 0.22 && metrics.ear > baselineEar * 0.9;
            const closedThreshold = Math.min(0.26, baselineEar * 0.75);

            if (!blinkDip) {
              if (isOpen) {
                startCtx.drawImage(rawCanvas, 0, 0);
                startT = now;
                baselineEar = baselineEar * 0.9 + metrics.ear * 0.1;
              } else if (metrics.ear < closedThreshold && startT !== null && now - startT < 400) {
                blinkDip = { minEar: metrics.ear, t: now };
                peakCtx.drawImage(rawCanvas, 0, 0);
              }
            } else {
              if (metrics.ear < blinkDip.minEar) {
                blinkDip = { minEar: metrics.ear, t: now };
                peakCtx.drawImage(rawCanvas, 0, 0);
              }
              if (now - startT > BLINK_MAX_MS) {
                // Eyes stayed shut too long — a natural blink reopens quickly.
                resetGestureState();
              } else if (isOpen) {
                burst = [
                  { canvas: startCanvas, t: startT },
                  { canvas: peakCanvas, t: blinkDip.t },
                  { canvas: rawCanvas, t: now },
                ];
              }
            }
          } else {
            const isNeutral =
              challengeId === "smile"
                ? metrics.happy < 0.3 && metrics.smile < 0.4
                : metrics.yaw >= NEUTRAL_YAW[0] && metrics.yaw <= NEUTRAL_YAW[1];
            const isGesture =
              challengeId === "left"
                ? metrics.yaw > 1.38
                : challengeId === "right"
                ? metrics.yaw < 0.72
                : metrics.happy > 0.7 || metrics.smile > 0.42;

            if (isNeutral) {
              startCtx.drawImage(rawCanvas, 0, 0);
              startT = now;
            } else if (isGesture && startT !== null) {
              const age = now - startT;
              if (age > NEUTRAL_MAX_AGE_MS) {
                setBottomStatus("Too slow — face the camera again, then " + meta.label.toLowerCase());
                startT = null;
              } else if (age >= NEUTRAL_MIN_AGE_MS) {
                burst = [
                  { canvas: startCanvas, t: startT },
                  { canvas: rawCanvas, t: now },
                ];
              }
            }
          }

          if (!burst) {
            await nextFrame();
            continue;
          }

          const frames = burst.map((f) => ({ image: f.canvas.toDataURL("image/jpeg", 0.92), t: f.t }));
          resetGestureState();
          setBottomStatus("Verifying " + meta.label.toUpperCase() + " & Anti-Spoofing on server...");

          let res;
          let data;
          try {
            res = await fetch("/api/checkLiveness", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: sessionIdRef.current, challenge: challengeId, frames }),
            });
            data = await res.json().catch(() => ({ passed: false, reason: `Server returned ${res.status}` }));
          } catch (networkErr) {
            networkFailures++;
            if (networkFailures >= MAX_NETWORK_FAILURES) {
              setSpoofWarning("Cannot reach the verification server. Check the server console, then reload the page.");
              setBottomStatus("Liveness check stopped.");
              break;
            }
            setSpoofWarning("Connection to server lost — retrying...");
            await sleep(1000 * networkFailures);
            continue;
          }
          networkFailures = 0;
          if (cancelled) break;

          if (data.restart) {
            setSpoofWarning(data.reason || "Liveness session ended.");
            setBottomStatus("Click Try again to start a fresh session when you are ready.");
            break;
          }

          if (!res.ok || !data.passed) {
            setSpoofWarning(data.reason || "Server error during liveness check");
            setBottomStatus(meta.statusText);
            await sleep(300);
            continue;
          }

          setSpoofWarning("");
          setCompletedSteps(data.completed || []);

          if (data.allDone) {
            cancelled = true;
            setIsLive(true);
            setStatusBanner("✅ Liveness Verified! Matching Face Biometrics...");
            setBottomStatus("Verifying Face Identity with Reference Photo...");
            await verifyFinalFaceMatch(data.proof);
            break;
          }

          const nextIdx = challengeIdxRef.current + 1;
          challengeIdxRef.current = nextIdx;
          stepStartedRef.current = performance.now();
          setChallengeIndex(nextIdx);
          setStatusBanner(titleFor(challengeOrderRef.current, nextIdx));
          setBottomStatus(CHALLENGE_META[challengeOrderRef.current[nextIdx]].statusText);
        } catch (err) {
          console.error("[Liveness Loop Error]:", err);
          await sleep(300);
        }

        await nextFrame();
      }
    };

    runDetectionLoop();

    return () => {
      cancelled = true;
    };
    // doctorId/doctorName are fixed once step 2 opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, modelsLoaded, isLive]);

  // 4. FINAL BIOMETRIC FACE MATCH (/api/verifyFace) — server uses its own stored liveness frame
  const verifyFinalFaceMatch = async (livenessProof) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/verifyFace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, livenessProof }),
      });

      const data = await res.json();

      if (data.metrics) {
        console.log("[Face Match] Backend AI Metrics:", data.metrics);
      }

      if (!res.ok || !data.verified) {
        throw new Error(data.error || "Face biometric verification failed.");
      }

      registrationTokenRef.current = data.registrationToken;
      setStatusBanner("🎉 IDENTITY CONFIRMED! Redirecting to Step 3...");
      setBottomStatus("Match Confidence: " + (data.metrics?.matchConfidence || "") + "%");
      setTimeout(() => setStep(3), 1500);
    } catch (err) {
      setError(err.message);
      // Re-running the effect starts a brand-new session with a new random order.
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  // 5. COMPLETE REGISTRATION (Step 3)
  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!walletAddress) {
      setError("Please provide wallet address");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/completeDoctorRegistration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          password,
          walletAddress,
          registrationToken: registrationTokenRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      registrationTokenRef.current = null;
      alert("Registration Successful!");
      router.push("/loginDoctor");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentChallengeId = challengeOrder[challengeIndex];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-lg bg-white p-8 rounded-lg shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-teal-700 mb-6">
          {step === 1 && "Step 1: Identity Lookup"}
          {step === 2 && "Step 2: Anti-Spoofing Verification"}
          {step === 3 && "Step 3: Secure Registration"}
        </h1>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}

        {/* --- STEP 1: FORM --- */}
        {step === 1 && (
          <form onSubmit={handleCheckIdentity} className="space-y-4">
            <div>
              <label className="block text-gray-700 font-bold mb-2">Doctor ID</label>
              <input
                type="number"
                className="w-full p-3 border rounded shadow-sm focus:ring-2 focus:ring-teal-500"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 font-bold mb-2">Full Name</label>
              <input
                type="text"
                className="w-full p-3 border rounded shadow-sm focus:ring-2 focus:ring-teal-500"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                required
              />
            </div>
            <button
              disabled={loading}
              className="w-full bg-teal-600 text-white py-3 rounded hover:bg-teal-700 font-bold transition duration-200"
            >
              {loading ? "Searching..." : "Next"}
            </button>
          </form>
        )}

        {/* --- STEP 2: CAMERA & STEP-BY-STEP LIVENESS UI --- */}
        {step === 2 && (
          <div className="flex flex-col items-center w-full">
            {!modelsLoaded ? (
              <p className="text-gray-500 font-semibold py-8">Initializing AI Engines...</p>
            ) : (
              <>
                {/* Dynamic Blue Banner Above Camera */}
                <div className="w-full bg-blue-100 border-l-4 border-blue-600 text-blue-800 p-4 mb-3 text-center rounded">
                  <p className="font-bold text-base">
                    {statusBanner || (currentChallengeId ? titleFor(challengeOrder, challengeIndex) : "")}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {challengeOrder.map((id, idx) => {
                      const label = CHALLENGE_META[id].label;
                      const done = completedSteps.includes(id);
                      const active = challengeIndex === idx && !isLive;
                      return (
                        <span
                          key={id}
                          className={`px-2.5 py-1 rounded text-xs font-bold ${
                            done
                              ? "bg-green-600 text-white"
                              : active
                              ? "bg-blue-600 text-white animate-pulse"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {done ? `✓ ${label}` : `${idx + 1}. ${label}`}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {spoofWarning && (
                  <div className="w-full bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-center text-sm font-bold">
                    {spoofWarning}
                  </div>
                )}

                {cameras.length > 1 && (
                  <div className="w-full mb-3">
                    <label htmlFor="camera-select" className="block text-xs font-bold text-gray-600 mb-1">
                      Camera
                    </label>
                    <select
                      id="camera-select"
                      className="w-full p-2 border rounded text-sm"
                      value={cameraId}
                      onChange={(e) => setCameraId(e.target.value)}
                    >
                      <option value="">Default camera</option>
                      {cameras.map((c, i) => (
                        <option key={c.deviceId} value={c.deviceId}>
                          {c.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {faceLuma !== null && faceLuma < MIN_FACE_LUMA && (
                  <div className="w-full bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-2 rounded mb-3 text-center text-sm">
                    {"Face too dark (brightness " + faceLuma + "/255). Face a window or lamp, raise screen brightness, or switch to DroidCam."}
                  </div>
                )}

                <div className="relative border-4 border-black rounded-lg overflow-hidden mb-3 bg-black">
                  <Webcam
                    key={cameraId || "default"}
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width={400}
                    height={300}
                    videoConstraints={videoConstraints}
                    onUserMedia={handleUserMedia}
                  />
                  {!isLive ? (
                    <div className="absolute top-2 right-2 bg-black bg-opacity-75 text-white px-3 py-1 rounded text-xs">
                      🔴 Step {challengeIndex + 1}/{challengeOrder.length || 4}
                    </div>
                  ) : (
                    <div className="absolute top-2 right-2 bg-green-600 text-white px-3 py-1 rounded text-xs font-bold">
                      🟢 LIVE VERIFIED
                    </div>
                  )}
                </div>

                {/* Live Telemetry Bar for Easy Debugging */}
                {liveTelemetry && (
                  <p className="text-xs font-mono text-gray-500 mb-2">{liveTelemetry}</p>
                )}

                {/* Dynamic Gold/Green Status Bar Below Camera */}
                <div
                  className={`w-full py-3 px-4 rounded font-bold text-white text-center transition ${
                    isLive ? "bg-green-600" : "bg-yellow-500"
                  }`}
                >
                  {bottomStatus || (currentChallengeId ? CHALLENGE_META[currentChallengeId].statusText : "")}
                </div>
              </>
            )}
          </div>
        )}

        {/* --- STEP 3: PASSWORD --- */}
        {step === 3 && (
          <form onSubmit={handleCompleteRegistration} className="space-y-4">
            <div className="bg-green-50 p-4 rounded border border-green-200">
              <h3 className="text-green-800 font-bold">Verification Passed</h3>
              <p className="text-green-700 text-sm">Biometrics & Liveness match Dr. {doctorName}.</p>
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                className="w-full p-3 border rounded"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Set Password</label>
              <input
                type="password"
                minLength={8}
                className="w-full p-3 border rounded"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">Confirm Password</label>
              <input
                type="password"
                minLength={8}
                className="w-full p-3 border rounded"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button
              disabled={loading}
              className="w-full bg-green-600 text-white py-3 rounded hover:bg-green-700 font-bold"
            >
              {loading ? "Registering..." : "Finalize Registration"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
