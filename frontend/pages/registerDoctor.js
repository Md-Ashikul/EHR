import { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import { useRouter } from "next/router";
import * as faceapi from 'face-api.js';

export default function RegisterDoctor() {
  const router = useRouter();
  
  // ------------------------------------------------
  // STATE MANAGEMENT
  // ------------------------------------------------
  const [step, setStep] = useState(1); // 1:Identity, 2:Liveness/Verify, 3:Password
  
  // User Data
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Verification Data
  const [referencePhoto, setReferencePhoto] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  
  // UI Flags
  const [loading, setLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState("");
  
  // Liveness Logic
  const webcamRef = useRef(null);
  const [isLive, setIsLive] = useState(false);
  const [livenessInterval, setLivenessInterval] = useState(null);

  // ------------------------------------------------
  // 1. LOAD AI MODELS
  // ------------------------------------------------
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = '/models'; // Matches public/models
      setVerificationMessage("Loading AI brains...");
      try {
        await Promise.all([
          // Detect faces
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          // Detect face shape (landmarks)
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          // Recognize/Compare faces
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          // Detect expressions (Smile)
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL) 
        ]);
        setModelsLoaded(true);
        setVerificationMessage("");
        console.log("ALL AI Models loaded successfully");
      } catch (e) {
        setError("Error loading AI models. Did you download them to public/models?");
        console.error("Model loading error:", e);
      }
    };
    loadModels();

    // Cleanup interval if user leaves page
    return () => {
      if (livenessInterval) clearInterval(livenessInterval);
    };
  }, []);

  // ------------------------------------------------
  // 2. IDENTITY CHECK (Step 1)
  // ------------------------------------------------
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

      // Success
      setReferencePhoto(data.referencePhotoUrl);
      setStep(2); // Go to Liveness Check
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // 3. LIVENESS CHECK (The "Smile" Test)
  // ------------------------------------------------
  const startLivenessCheck = () => {
    if (!modelsLoaded) return;
    setError("");
    setVerificationMessage("ANTI-SPOOF CHECK: Please SMILE at the camera :)");
    
    // We check the video stream every 500ms
    const interval = setInterval(async () => {
      if (!webcamRef.current || !webcamRef.current.video) return;

      const video = webcamRef.current.video;

      // Detect face AND expressions
      const detections = await faceapi.detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceExpressions();

      if (detections) {
        // 'happy' returns a confidence score (0 to 1)
        const smileScore = detections.expressions.happy;
        console.log("Smile Score:", smileScore);

        // Threshold: 0.7 means very likely smiling
        if (smileScore > 0.7) {
          clearInterval(interval);
          setLivenessInterval(null);
          setIsLive(true);
          setVerificationMessage("Smile Detected! Verifying biometric match...");
          
          // IMMEDIATELY proceed to biometric verification
          verifyBiometrics(video); 
        }
      }
    }, 500);

    setLivenessInterval(interval);
  };

  // ------------------------------------------------
  // 4. BIOMETRIC VERIFICATION (Face Match)
  // ------------------------------------------------
  const verifyBiometrics = async (videoElement) => {
    setLoading(true);
    try {
      // A. Load Reference Photo (from DB)
      const refImageEl = document.createElement('img');
      refImageEl.src = referencePhoto;
      // Wait for it to load in memory
      await new Promise((resolve, reject) => { 
          refImageEl.onload = resolve; 
          refImageEl.onerror = () => reject("Could not load reference photo from DB");
      });

      // B. Compute AI Descriptor for Reference Photo
      const refResult = await faceapi.detectSingleFace(refImageEl)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!refResult) {
        throw new Error("Admin Error: No face found in the database reference photo.");
      }

      // C. Compute AI Descriptor for Live Webcam
      const webcamResult = await faceapi.detectSingleFace(videoElement)
        .withFaceLandmarks()
        .withFaceDescriptor();
        
      if (!webcamResult) {
        throw new Error("Verification Error: Lost face tracking. Please try again.");
      }

      // D. Compare the two Descriptors (Euclidean Distance)
      const faceMatcher = new faceapi.FaceMatcher(refResult.descriptor);
      const match = faceMatcher.findBestMatch(webcamResult.descriptor);

      // Distance < 0.6 is the standard threshold for "Same Person"
      if (match.distance <= 0.6) {
        setVerificationMessage("IDENTITY CONFIRMED. Redirecting...");
        setTimeout(() => setStep(3), 2000); // Move to Password Step
      } else {
        setIsLive(false); // Reset liveness
        throw new Error("Liveness passed, but face does NOT match records.");
      }

    } catch (err) {
      setError(err.message);
      setVerificationMessage("");
      // Stop the liveness loop if it was running
      if (livenessInterval) clearInterval(livenessInterval);
      setLivenessInterval(null);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // 5. REGISTRATION (Step 3)
  // ------------------------------------------------
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

  // ------------------------------------------------
  // UI RENDER
  // ------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-lg bg-white p-8 rounded-lg shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-teal-700 mb-6">
            {step === 1 && "Step 1: Identity Lookup"}
            {step === 2 && "Step 2: Anti-Spoofing Verification"}
            {step === 3 && "Step 3: Secure Registration"}
        </h1>

        {/* ERROR / STATUS MESSAGES */}
        {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
                <p className="font-bold">Error</p>
                <p>{error}</p>
            </div>
        )}
        {verificationMessage && (
            <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-4 text-center">
                <p className="font-bold animate-pulse">{verificationMessage}</p>
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

        {/* --- STEP 2: CAMERA --- */}
        {step === 2 && (
          <div className="flex flex-col items-center">
             {!modelsLoaded ? (
                 <p className="text-gray-500">Initializing AI Engines...</p>
             ) : (
                <>
                    <div className="relative border-4 border-black rounded-lg overflow-hidden mb-4 bg-black">
                        <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            width={400}
                            height={300}
                            videoConstraints={{ facingMode: "user" }}
                        />
                        {/* Overlay Guide */}
                        {!isLive && (
                            <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-xs">
                                🔴 Not Live
                            </div>
                        )}
                        {isLive && (
                             <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded text-xs">
                                🟢 LIVE
                             </div>
                        )}
                    </div>

                    {!livenessInterval && !isLive && (
                        <button 
                            onClick={startLivenessCheck}
                            className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700"
                        >
                            Start Liveness Check
                        </button>
                    )}
                    
                    {livenessInterval && (
                         <button disabled className="w-full bg-yellow-500 text-white py-3 rounded font-bold cursor-wait">
                            Looking for Smile...
                        </button>
                    )}
                </>
             )}
          </div>
        )}

        {/* --- STEP 3: PASSWORD --- */}
        {step === 3 && (
          <form onSubmit={handleCompleteRegistration} className="space-y-4">
            <div className="bg-green-50 p-4 rounded border border-green-200">
                <h3 className="text-green-800 font-bold">Verification Passed</h3>
                <p className="text-green-700 text-sm">Biometrics match Dr. {doctorName}.</p>
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
            <button disabled={loading} className="w-full bg-green-600 text-white py-3 rounded hover:bg-green-700 font-bold">
              {loading ? "Registering..." : "Finalize Registration"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}