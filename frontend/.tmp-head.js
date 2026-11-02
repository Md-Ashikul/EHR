import { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import { useRouter } from "next/router";
import * as faceapi from "@vladmandic/face-api";

const CHALLENGE_META = {
  blink: {
    label: "Blink",
    instruction: "BLINK once",
    statusText: "Look straight at the camera and blink once",
  },
  left: {
    label: "Turn Left",
    instruction: "TURN YOUR HEAD LEFT",
    statusText: "Turn toward your LEFT shoulder",
  },
  right: {
    label: "Turn Right",
    instruction: "TURN YOUR HEAD RIGHT",
    statusText: "Turn toward your RIGHT shoulder",
  },
  smile: {
    label: "Smile",
    instruction: "SMILE",
    statusText: "Give a big smile",
  },
};

const titleFor = (order, idx) => `(${idx + 1}/${order.length}) ${CHALLENGE_META[order[idx]].instruction}`;

const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const DETECT_WIDTH = 480;
const LUMA_SAMPLE = 24;
const MIN_FACE_LUMA = 80;

// Face lock: the server session (and its 10s clock) only starts after the face is held
// frontal, well-lit and steady for LOCK_HOLD_MS.
const LOCK_HOLD_MS = 1200;
const LOCK_MIN_SCORE = 0.6;
const LOCK_MIN_FACE_FRAC = 0.18;
const LOCK_MAX_FACE_FRAC = 0.65;
const LOCK_MAX_JITTER = 0.08;

// After each step succeeds, the camera is ignored briefly so the face can relax from the
// previous gesture (e.g. a fading smile must not be captured as the next step's "before" frame).
const TRANSITION_DEAF_MS = 500;

// Client thresholds are slightly stricter than the server's so borderline bursts aren't wasted round-trips.
const NEUTRAL_YAW = [0.85, 1.2];
const BLINK_MAX_MS = 1300;
const NEUTRAL_MAX_AGE_MS = 3500;
const NEUTRAL_MIN_AGE_MS = 150;

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

function lockProblem(detection, metrics, faceFrac, luma, jitter) {
  if (detection.detection.score < LOCK_MIN_SCORE) return "Face not clear — improve lighting and face the camera";
  if (faceFrac < LOCK_MIN_FACE_FRAC) return "Move a little closer to the camera";
  if (faceFrac > LOCK_MAX_FACE_FRAC) return "Move back so your whole head fits in the frame";
  if (metrics.yaw < NEUTRAL_YAW[0] || metrics.yaw > NEUTRAL_YAW[1]) return "Look straight at the camera";
  if (luma !== null && luma < MIN_FACE_LUMA) return "Face too dark — add light in front of you";
  if (metrics.ear < 0.2) return "Keep your eyes open";
  if (jitter > LOCK_MAX_JITTER) return "Hold still";
  return null;
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
  // phase: warmup -> aligning -> challenge -> verifying | failed | blocked
  const [phase, setPhase] = useState("warmup");
  const [attempt, setAttempt] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [lockProgress, setLockProgress] = useState(0);
  const [faceBox, setFaceBox] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
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

  const retryLiveness = () => {
    setError("");
    setSpoofWarning("");
    setAttempt((a) => a + 1);
  };

  // 3. LIVENESS LOOP: camera warm-up -> face lock -> (server session starts) -> timed challenges
  // Re-runs only when the user explicitly clicks "Try again" (attempt changes) — never automatically,
  // so a struggling user can't burn through the server's per-doctor session rate limit.
  useEffect(() => {
    if (step !== 2 || !modelsLoaded) return;

    let cancelled = false;

    setIsLive(false);
    setChallengeOrder([]);
    setChallengeIndex(0);
    setCompletedSteps([]);
    setLockProgress(0);
    setSecondsLeft(null);
    setFaceBox(null);
    setPhase("warmup");
    setStatusBanner("Starting camera...");
    setBottomStatus("Allow camera access and choose your camera. The timer has NOT started yet.");

    const fail = (reason) => {
      setPhase("failed");
      setFaceBox(null);
      setSecondsLeft(null);
      setSpoofWarning(reason);
      setStatusBanner("Verification not completed");
      setBottomStatus("Click “Try again” when ready. The timer starts only after your face is locked again.");
    };

    const startSession = async () => {
      const res = await fetch("/api/startLiveness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId, doctorName }),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, data };
    };

    const run = async () => {
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

      let currentPhase = "warmup";
      let lockSince = null;
      let lastLockCenter = null;
      let deadline = 0;
      let deafUntil = 0;

      // startT = time of the last "before" frame (eyes open / neutral face) held in startCanvas.
      let startT = null;
      let blinkDip = null;
      let baselineEar = null;
      let lastChallengeId = null;
      let frameCount = 0;
      let networkFailures = 0;
      const MAX_NETWORK_FAILURES = 3;

      const resetGestureState = () => {
        startT = null;
        blinkDip = null;
        baselineEar = null;
      };

      const measureLuma = (b, scale) => {
        lumaCtx.drawImage(rawCanvas, b.x / scale, b.y / scale, b.width / scale, b.height / scale, 0, 0, LUMA_SAMPLE, LUMA_SAMPLE);
        const px = lumaCtx.getImageData(0, 0, LUMA_SAMPLE, LUMA_SAMPLE).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        return Math.round(sum / (px.length / 4));
      };

      // Maps a box from detectCanvas coordinates onto the rendered <video> (object-fit: contain).
      const toOverlayBox = (video, b, scale, ok) => {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const elW = video.clientWidth;
        const elH = video.clientHeight;
        const s = Math.min(elW / vw, elH / vh);
        const offX = (elW - vw * s) / 2;
        const offY = (elH - vh * s) / 2;
        return {
          left: offX + (b.x / scale) * s,
          top: offY + (b.y / scale) * s,
          width: (b.width / scale) * s,
          height: (b.height / scale) * s,
          ok,
        };
      };

      while (!cancelled) {
        // ---- PHASE 1: CAMERA WARM-UP (no server contact, no clock) ----
        const video = webcamRef.current?.video;
        if (!video || video.readyState < 2 || !video.videoWidth) {
          setFaceBox(null);
          lockSince = null;
          await sleep(150);
          continue;
        }
        if (currentPhase === "warmup") {
          currentPhase = "aligning";
          setPhase("aligning");
          setStatusBanner("Position your face in the frame");
          setBottomStatus("Look straight at the camera and hold still. The 10-second test starts once your face is locked.");
        }

        try {
          const inChallenge = currentPhase === "challenge";
          const challengeId = inChallenge ? challengeOrderRef.current[challengeIdxRef.current] : null;
          const loopNow = performance.now();

          if (inChallenge) {
            if (loopNow > deadline) {
              fail("Time is up — all 4 gestures must be completed within 10 seconds.");
              break;
            }
            setSecondsLeft(Math.max(0, Math.ceil((deadline - loopNow) / 1000)));
            // ---- PHASE 4: TRANSITION BUFFER between gestures ----
            if (loopNow < deafUntil) {
              await sleep(50);
              continue;
            }
            if (challengeId !== lastChallengeId) {
              resetGestureState();
              lastChallengeId = challengeId;
            }
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
            setFaceBox(null);
            lockSince = null;
            lastLockCenter = null;
            if (!inChallenge) {
              setLockProgress(0);
              setBottomStatus("No face detected — sit so your whole head is visible");
            }
            setLiveTelemetry("No face detected");
            await nextFrame();
            continue;
          }

          frameCount++;
          const metrics = computeClientMetrics(detection.landmarks, detection.expressions);
          const b = detection.detection.box;

          // ---- PHASE 2: FACE LOCK (client only, no clock) ----
          if (!inChallenge) {
            const luma = measureLuma(b, scale);
            setFaceLuma(luma);
            const center = { x: (b.x + b.width / 2) / dw, y: (b.y + b.height / 2) / dh };
            const jitter = lastLockCenter ? Math.hypot(center.x - lastLockCenter.x, center.y - lastLockCenter.y) : 0;
            lastLockCenter = center;

            const problem = lockProblem(detection, metrics, b.width / dw, luma, jitter);
            setFaceBox(toOverlayBox(video, b, scale, !problem));
            setLiveTelemetry(
              `Face ${Math.round(detection.detection.score * 100)}% | Yaw ${metrics.yaw.toFixed(2)} | EAR ${metrics.ear.toFixed(2)} | Light ${luma}`
            );

            if (problem) {
              lockSince = null;
              setLockProgress(0);
              setBottomStatus(problem);
              await nextFrame();
              continue;
            }

            if (lockSince === null) lockSince = now;
            const progress = Math.min(1, (now - lockSince) / LOCK_HOLD_MS);
            setLockProgress(progress);
            if (progress < 1) {
              setBottomStatus("Face found — hold still...");
              await nextFrame();
              continue;
            }

            // ---- PHASE 3: START THE CLOCK ----
            setBottomStatus("Face locked. Starting secure session...");
            let result;
            try {
              result = await startSession();
            } catch {
              fail("Cannot reach the verification server.");
              break;
            }
            if (cancelled) break;
            if (result.status === 429) {
              setPhase("blocked");
              setFaceBox(null);
              setStatusBanner("Too many attempts");
              setSpoofWarning(result.data.error || "Too many liveness attempts. Please wait and try again later.");
              setBottomStatus("Liveness check paused.");
              break;
            }
            if (!result.ok) {
              fail(result.data.error || "Could not start liveness session.");
              break;
            }

            const data = result.data;
            sessionIdRef.current = data.sessionId;
            challengeOrderRef.current = data.challenges;
            challengeIdxRef.current = 0;
            setAttemptsLeft(data.attemptsLeft);
            setChallengeOrder(data.challenges);
            setChallengeIndex(0);
            setCompletedSteps([]);
            setSpoofWarning("");
            setLockProgress(1);
            setStatusBanner(titleFor(data.challenges, 0));
            setBottomStatus(CHALLENGE_META[data.challenges[0]].statusText);

            const t = performance.now();
            deadline = t + data.windowMs;
            deafUntil = t + TRANSITION_DEAF_MS;
            lastChallengeId = null;
            resetGestureState();
            currentPhase = "challenge";
            setPhase("challenge");
            setSecondsLeft(Math.ceil(data.windowMs / 1000));
            continue;
          }

          // ---- CHALLENGE: capture a movement burst for the current gesture ----
          const meta = CHALLENGE_META[challengeId];
          setFaceBox(toOverlayBox(video, b, scale, true));
          if (frameCount % 10 === 1) setFaceLuma(measureLuma(b, scale));
          setLiveTelemetry(
            `EAR ${metrics.ear.toFixed(2)} | Yaw ${metrics.yaw.toFixed(2)} | Smile ${Math.round(metrics.happy * 100)}%`
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
            } else if (isGesture && startT === null) {
              setBottomStatus("Face the camera first, then " + meta.label.toLowerCase());
            } else if (isGesture) {
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
          setBottomStatus("Verifying " + meta.label.toUpperCase() + "...");

          // Server verification time is excluded from the user's 10s (the server does the same).
          const fetchStart = performance.now();
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
              fail("Cannot reach the verification server. Check the server console.");
              break;
            }
            setSpoofWarning("Connection to server lost — retrying...");
            await sleep(500);
            continue;
          } finally {
            deadline += performance.now() - fetchStart;
          }
          networkFailures = 0;
          if (cancelled) break;

          if (data.restart) {
            fail(data.reason || "Liveness session ended.");
            break;
          }

          if (!res.ok || !data.passed) {
            setSpoofWarning(data.reason || "Server error during liveness check");
            setBottomStatus(meta.statusText);
            await nextFrame();
            continue;
          }

          setSpoofWarning("");
          setCompletedSteps(data.completed || []);

          if (data.allDone) {
            cancelled = true;
            setPhase("verifying");
            setSecondsLeft(null);
            setIsLive(true);
            setStatusBanner("Liveness Verified! Matching face biometrics...");
            setBottomStatus("Verifying face identity with reference photo...");
            await verifyFinalFaceMatch(data.proof);
            break;
          }

          const nextIdx = challengeIdxRef.current + 1;
          challengeIdxRef.current = nextIdx;
          deafUntil = performance.now() + TRANSITION_DEAF_MS;
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

    run();

    return () => {
      cancelled = true;
    };
    // doctorId/doctorName are fixed once step 2 opens; attempt changes only via "Try again"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, modelsLoaded, attempt]);

