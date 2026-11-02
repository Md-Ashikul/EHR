import { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import { useRouter } from "next/router";
import * as faceapi from "face-api.js";

const CHALLENGES = [
  { id: "blink", title: "ANTI-SPOOF CHECK (1/4): Please BLINK your eyes", statusText: "Looking for Blink..." },
  { id: "left", title: "ANTI-SPOOF CHECK (2/4): Please TURN YOUR HEAD LEFT", statusText: "Looking for Left Head Turn..." },
  { id: "right", title: "ANTI-SPOOF CHECK (3/4): Please TURN YOUR HEAD RIGHT", statusText: "Looking for Right Head Turn..." },
  { id: "smile", title: "ANTI-SPOOF CHECK (4/4): Please SMILE at the camera :)", statusText: "Looking for Smile..." },
];

const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const DETECT_WIDTH = 480;
const LUMA_SAMPLE = 24;
const MIN_FACE_LUMA = 80;

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
  const [referencePhoto, setReferencePhoto] = useState("");
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
  const completedTokenRef = useRef(null);
  const challengeIdxRef = useRef(0);

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

      setReferencePhoto(data.referencePhotoUrl);
      setChallengeIndex(0);
      challengeIdxRef.current = 0;
      setCompletedSteps([]);
      completedTokenRef.current = null;
      setIsLive(false);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. AUTOMATIC STEP-BY-STEP LIVENESS LOOP WHEN STEP 2 OPENS
  useEffect(() => {
    if (step !== 2 || !modelsLoaded || isLive) return;

    setStatusBanner(CHALLENGES[0].title);
    setBottomStatus(CHALLENGES[0].statusText);

    let cancelled = false;

    const runDetectionLoop = async () => {
      // rawCanvas = untouched pixels (sent to server for PAD — MiniFASNet must see real sensor texture).
      // detectCanvas = downscaled + contrast-boosted copy used ONLY for fast client-side landmark tracking.
      const rawCanvas = document.createElement("canvas");
      const rawCtx = rawCanvas.getContext("2d");
      const detectCanvas = document.createElement("canvas");
      const detectCtx = detectCanvas.getContext("2d");
      const blinkCanvas = document.createElement("canvas");
      const blinkCtx = blinkCanvas.getContext("2d");
      const lumaCanvas = document.createElement("canvas");
      lumaCanvas.width = LUMA_SAMPLE;
      lumaCanvas.height = LUMA_SAMPLE;
      const lumaCtx = lumaCanvas.getContext("2d", { willReadFrequently: true });

      // Client detection is only a trigger hint; the server re-detects at the strict 0.50 confidence.
      const trackerOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

      let baselineEar = null;
      let blinkDip = null;
      let frameCount = 0;

      while (!cancelled) {
        const video = webcamRef.current?.video;
        if (!video || video.readyState < 2 || !video.videoWidth) {
          await sleep(100);
          continue;
        }

        try {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const scale = Math.min(1, DETECT_WIDTH / vw);
          const dw = Math.round(vw * scale);
          const dh = Math.round(vh * scale);
          if (rawCanvas.width !== vw || rawCanvas.height !== vh) {
            rawCanvas.width = blinkCanvas.width = vw;
            rawCanvas.height = blinkCanvas.height = vh;
            detectCanvas.width = dw;
            detectCanvas.height = dh;
          }

          rawCtx.drawImage(video, 0, 0, vw, vh);
          detectCtx.filter = "contrast(1.25) brightness(1.2)";
          detectCtx.drawImage(rawCanvas, 0, 0, dw, dh);
          detectCtx.filter = "none";

          const currentIdx = challengeIdxRef.current;
          const currentChallenge = CHALLENGES[currentIdx];
          if (!currentChallenge) break;

          // Expressions net is only needed for the smile step — skipping it roughly halves frame time.
          const baseTask = faceapi.detectSingleFace(detectCanvas, trackerOptions).withFaceLandmarks();
          const detection =
            currentChallenge.id === "smile" ? await baseTask.withFaceExpressions() : await baseTask;

          if (cancelled) break;

          if (!detection) {
            setLiveTelemetry("No face detected — sit slightly back so your whole head is visible");
            await nextFrame();
            continue;
          }

          frameCount++;
          const metrics = computeClientMetrics(detection.landmarks, detection.expressions);

          if (frameCount % 10 === 1) {
            const b = detection.detection.box;
            lumaCtx.drawImage(rawCanvas, b.x / scale, b.y / scale, b.width / scale, b.height / scale, 0, 0, LUMA_SAMPLE, LUMA_SAMPLE);
            const px = lumaCtx.getImageData(0, 0, LUMA_SAMPLE, LUMA_SAMPLE).data;
            let sum = 0;
            for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            setFaceLuma(Math.round(sum / (px.length / 4)));
          }

          const scorePct = Math.round(detection.detection.score * 100);
          const smilePct = Math.round(metrics.happy * 100);
          setLiveTelemetry(
            "Face Locked ✓ (" +
              scorePct +
              "%) | EAR: " +
              metrics.ear.toFixed(2) +
              (baselineEar ? " (open≈" + baselineEar.toFixed(2) + ")" : "") +
              " | Yaw: " +
              metrics.yaw.toFixed(2) +
              " | Smile: " +
              smilePct +
              "%"
          );

          let sendCanvas = null;
          if (currentChallenge.id === "blink") {
            // A blink lasts ~100-300ms, so treat it as an event: open → closed (keep the most-closed
            // raw frame) → reopened. Only a genuine transition gets sent to the server.
            if (baselineEar === null) baselineEar = metrics.ear;
            const closedThreshold = Math.min(0.26, baselineEar * 0.8);

            if (!blinkDip) {
              if (metrics.ear < closedThreshold) {
                blinkDip = { minEar: metrics.ear, frames: 1 };
                blinkCtx.drawImage(rawCanvas, 0, 0);
              } else {
                baselineEar = baselineEar * 0.9 + metrics.ear * 0.1;
              }
            } else {
              blinkDip.frames++;
              if (metrics.ear < blinkDip.minEar) {
                blinkDip.minEar = metrics.ear;
                blinkCtx.drawImage(rawCanvas, 0, 0);
              }
              const reopened = metrics.ear > baselineEar * 0.9;
              if (reopened || blinkDip.frames >= 6) {
                console.log("[v0] Blink captured, min EAR:", blinkDip.minEar.toFixed(3), "baseline:", baselineEar.toFixed(3));
                sendCanvas = blinkCanvas;
                blinkDip = null;
              }
            }
          } else if (currentChallenge.id === "left") {
            if (metrics.yaw > 1.35) sendCanvas = rawCanvas; // Turn toward YOUR LEFT shoulder
          } else if (currentChallenge.id === "right") {
            if (metrics.yaw < 0.74) sendCanvas = rawCanvas; // Turn toward YOUR RIGHT shoulder
          } else if (currentChallenge.id === "smile") {
            if (metrics.happy > 0.6 || metrics.smile > 0.42) sendCanvas = rawCanvas;
          }

          if (!sendCanvas) {
            await nextFrame();
            continue;
          }

          setBottomStatus("Verifying " + currentChallenge.id.toUpperCase() + " & Anti-Spoofing on server...");
          const frameBase64 = sendCanvas.toDataURL("image/jpeg", 0.92);

          const res = await fetch("/api/checkLiveness", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frame: frameBase64,
              challenge: currentChallenge.id,
              completedToken: completedTokenRef.current,
            }),
          });

          const data = await res.json();
          if (cancelled) break;

          if (!res.ok) {
            setSpoofWarning(data.reason || "Server error during liveness check");
            await sleep(300);
            continue;
          }

          if (data.pad && !data.pad.isReal) {
            setSpoofWarning("⚠️ " + data.reason);
            setBottomStatus(currentChallenge.statusText);
            await sleep(300);
            continue;
          } else {
            setSpoofWarning(data.live ? "" : data.reason && data.reason !== "ok" ? data.reason : "");
          }

          if (data.live) {
            completedTokenRef.current = data.token;
            setCompletedSteps(data.completed || []);

            if (data.allDone || currentIdx + 1 >= CHALLENGES.length) {
              cancelled = true;
              setIsLive(true);
              setStatusBanner("✅ Liveness Verified! Matching Face Biometrics...");
              setBottomStatus("Verifying Face Identity with Reference Photo...");
              await verifyFinalFaceMatch(frameBase64, data.token);
              break;
            } else {
              const nextIdx = currentIdx + 1;
              challengeIdxRef.current = nextIdx;
              setChallengeIndex(nextIdx);
              setStatusBanner(CHALLENGES[nextIdx].title);
              setBottomStatus(CHALLENGES[nextIdx].statusText);
            }
          } else {
            setBottomStatus(currentChallenge.statusText);
          }
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
  }, [step, modelsLoaded, isLive]);

  // 4. FINAL BIOMETRIC FACE MATCH (/api/verifyFace)
  const verifyFinalFaceMatch = async (liveImageBase64, livenessToken) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/verifyFace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          referencePhotoUrl: referencePhoto,
          liveImageBase64,
          livenessToken,
        }),
      });

      const data = await res.json();

      if (data.metrics) {
        console.log("[v0] Backend AI Metrics:", data.metrics);
      }

      if (!res.ok || !data.verified) {
        throw new Error(data.error || "Face biometric verification failed.");
      }

      setStatusBanner("🎉 IDENTITY CONFIRMED! Redirecting to Step 3...");
      setBottomStatus("Match Confidence: " + (data.metrics?.matchConfidence || "") + "%");
      setTimeout(() => setStep(3), 1500);
    } catch (err) {
      setError(err.message);
      setIsLive(false);
      challengeIdxRef.current = 0;
      setChallengeIndex(0);
      setCompletedSteps([]);
      completedTokenRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  // 5. COMPLETE REGISTRATION (Step 3)
  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
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
        body: JSON.stringify({ doctorId, password, walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("Registration Successful!");
      router.push("/loginDoctor");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
                  <p className="font-bold text-base">{statusBanner || CHALLENGES[challengeIndex]?.title}</p>
                  <div className="flex gap-2 justify-center mt-2">
                    {["Blink", "Turn Left", "Turn Right", "Smile"].map((label, idx) => {
                      const id = CHALLENGES[idx].id;
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
                      🔴 Step {challengeIndex + 1}/4
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
                  {bottomStatus || CHALLENGES[challengeIndex]?.statusText}
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
