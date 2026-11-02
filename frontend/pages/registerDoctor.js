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
  const isServerBusyRef = useRef(false);
  const completedTokenRef = useRef(null);
  const challengeIdxRef = useRef(0);
  const baselineEarRef = useRef(0.30);

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
      while (!cancelled && step === 2 && !isLive) {
        const video = webcamRef.current?.video;
        if (!video || video.readyState !== 4 || isServerBusyRef.current) {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }

        isServerBusyRef.current = true;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext("2d");

          // Fix B: Normalize dim indoor webcam lighting before running SSD MobileNetV1 (0.50 default threshold)
          ctx.filter = "contrast(1.25) brightness(1.15)";
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.filter = "none";

          const detection = await faceapi
            .detectSingleFace(canvas)
            .withFaceLandmarks()
            .withFaceExpressions();

          if (!detection) {
            setLiveTelemetry("No face detected — sit slightly back so your whole head is visible");
            isServerBusyRef.current = false;
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }

          const metrics = computeClientMetrics(detection.landmarks, detection.expressions);
          const currentIdx = challengeIdxRef.current;
          const currentChallenge = CHALLENGES[currentIdx];
          if (!currentChallenge) {
            isServerBusyRef.current = false;
            break;
          }

          if (metrics.ear > 0.26) {
            baselineEarRef.current = baselineEarRef.current * 0.8 + metrics.ear * 0.2;
          }

          const scorePct = Math.round(detection.detection.score * 100);
          const smilePct = Math.round(metrics.happy * 100);
          setLiveTelemetry(
            "Face Locked ✓ (" +
              scorePct +
              "%) | EAR: " +
              metrics.ear.toFixed(2) +
              " | Yaw: " +
              metrics.yaw.toFixed(2) +
              " | Smile: " +
              smilePct +
              "%"
          );

          let triggered = false;
          if (currentChallenge.id === "blink") {
            triggered = metrics.ear < 0.265 || metrics.ear < baselineEarRef.current * 0.86;
          } else if (currentChallenge.id === "left") {
            triggered = metrics.yaw > 1.35; // Turn toward YOUR LEFT shoulder
          } else if (currentChallenge.id === "right") {
            triggered = metrics.yaw < 0.74; // Turn toward YOUR RIGHT shoulder
          } else if (currentChallenge.id === "smile") {
            triggered = metrics.happy > 0.60 || metrics.smile > 0.42;
          }

          if (!triggered) {
            isServerBusyRef.current = false;
            await new Promise((r) => setTimeout(r, 120));
            continue;
          }

          setBottomStatus("Verifying " + currentChallenge.id.toUpperCase() + " & Anti-Spoofing on server...");
          const frameBase64 = canvas.toDataURL("image/jpeg", 0.90);

          const res = await fetch("/api/checkLiveness", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frame: frameBase64,
              challenge: currentChallenge.id,
              completedToken: completedTokenRef.current,
              clientMetrics: metrics,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            setSpoofWarning(data.reason || "Server error during liveness check");
            isServerBusyRef.current = false;
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }

          if (data.pad && !data.pad.isReal) {
            const padRealPct = Math.round(data.pad.realScore * 100);
            setSpoofWarning("⚠️ Spoof / Screen Detected! (Real score: " + padRealPct + "%)");
            setBottomStatus(currentChallenge.statusText);
            isServerBusyRef.current = false;
            await new Promise((r) => setTimeout(r, 300));
            continue;
          } else {
            setSpoofWarning("");
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
        } finally {
          isServerBusyRef.current = false;
        }

        await new Promise((r) => setTimeout(r, 150));
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

                <div className="relative border-4 border-black rounded-lg overflow-hidden mb-3 bg-black">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width={400}
                    height={300}
                    videoConstraints={{ width: 640, height: 480, facingMode: "user" }}
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