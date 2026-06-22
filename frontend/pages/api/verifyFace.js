import { readDoctorDB } from '../../lib/db-handler';
import { loadModels, ensureModelsLoaded, bufferToImage, getFaceDescriptor, checkSmileDetection, compareFaces, faceapi } from '../../lib/face-api-server';
import path from 'path';
import fs from 'fs';

// Global flag to load models only once
let modelsInitialized = false;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { doctorId, referencePhotoUrl, liveImageBase64 } = req.body;
  const doctorDatabase = readDoctorDB();

  try {
    console.log("--- STARTING REAL AI BIOMETRIC VERIFICATION ---");
    const t_start = performance.now();

    // 1. Basic validation
    if (!doctorId || !referencePhotoUrl || !liveImageBase64) {
      return res.status(400).json({ error: 'Missing doctor ID, reference photo, or live image.' });
    }

    const id = parseInt(doctorId, 10);
    const doctor = doctorDatabase[id];

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }

    // 2. Load AI Models (first time only)
    if (!modelsInitialized) {
      try {
        const MODEL_URL = path.join(process.cwd(), 'public', 'models');
        console.log("[AI] Loading face-api models...");
        await loadModels(MODEL_URL);
        modelsInitialized = true;
      } catch (modelErr) {
        console.error("[AI ERROR]", modelErr.message);
        return res.status(500).json({ error: 'Failed to load AI models. Ensure models are in public/models/' });
      }
    }

    // 3. Ensure models are ready
    ensureModelsLoaded();

    // 4. Load Reference Photo from filesystem
    const refPhotoPath = path.join(process.cwd(), 'public', referencePhotoUrl.replace(/^\//, ''));
    
    if (!fs.existsSync(refPhotoPath)) {
      return res.status(404).json({ error: `Reference photo not found at ${refPhotoPath}` });
    }

    const refImageBuffer = fs.readFileSync(refPhotoPath);
    const refImage = bufferToImage(refImageBuffer);

    // 5. Convert Live Image from Base64
    const base64Data = liveImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const liveImageBuffer = Buffer.from(base64Data, 'base64');
    const liveImage = bufferToImage(liveImageBuffer);

    // ============================================================
    // 5.5. LIVENESS CHECK: Validate Smile Detection on Live Image
    // ============================================================
    console.log(`[AI] Checking smile detection (liveness check)...`);
    const t_smileStart = performance.now();

    const smileCheck = await checkSmileDetection(liveImage, 0.7);
    
    const t_smileEnd = performance.now();
    const smileCheckTime = (t_smileEnd - t_smileStart).toFixed(2);

    console.log(`[LIVENESS] Smile Score: ${(smileCheck.smileScore * 100).toFixed(2)}%`);
    console.log(`[LIVENESS] Is Smiling: ${smileCheck.isSmiling}`);
    console.log(`[LIVENESS] Smile Detection Time: ${smileCheckTime} ms`);

    // If smile not detected, FAIL here (don't proceed to face matching)
    if (!smileCheck.isSmiling) {
      const failMetrics = {
        smileScore: (smileCheck.smileScore * 100).toFixed(2),
        smileCheckTime,
        totalLatency: ((performance.now() - t_start) / 1000).toFixed(2)
      };
      
      console.log(`[LIVENESS FAILED] Smile threshold not met. Score: ${failMetrics.smileScore}%`);
      
      return res.status(400).json({ 
        verified: false, 
        error: 'Liveness check failed: No smile detected. Please smile at the camera.',
        metrics: failMetrics
      });
    }

    // 6. Compute Face Descriptors
    console.log(`[AI] Computing descriptor for reference photo...`);
    const t_refStart = performance.now();
    
    const refDetection = await getFaceDescriptor(refImage);

    const t_refEnd = performance.now();
    const refComputeTime = (t_refEnd - t_refStart).toFixed(2);

    if (!refDetection) {
      return res.status(400).json({ 
        error: 'No face detected in reference photo. Admin must update the reference photo.',
        verified: false
      });
    }

    console.log(`[AI] Computing descriptor for live image...`);
    const t_liveStart = performance.now();
    
    const liveDetection = await getFaceDescriptor(liveImage);

    const t_liveEnd = performance.now();
    const liveComputeTime = (t_liveEnd - t_liveStart).toFixed(2);

    if (!liveDetection) {
      return res.status(400).json({ 
        error: 'No face detected in live image. Please position your face clearly.',
        verified: false
      });
    }

    // 7. Compare Descriptors
    console.log(`[AI] Comparing face descriptors...`);
    const THRESHOLD = 0.6;
    const comparison = compareFaces(refDetection.descriptor, liveDetection.descriptor, THRESHOLD);

    const refFaceScore = (refDetection.detection.score * 100).toFixed(2);
    const liveFaceScore = (liveDetection.detection.score * 100).toFixed(2);

    // 8. Calculate Metrics
    const t_end = performance.now();
    const totalLatency = (t_end - t_start).toFixed(2);

    // Log comprehensive metrics
    console.log(`[METRIC] === LIVENESS VERIFICATION ===`);
    console.log(`[METRIC] Smile Score: ${(smileCheck.smileScore * 100).toFixed(2)}%`);
    console.log(`[METRIC] Smile Detection Time: ${smileCheckTime} ms`);
    console.log(`[METRIC] === FACE RECOGNITION ===`);
    console.log(`[METRIC] Reference Face Confidence: ${refFaceScore}%`);
    console.log(`[METRIC] Live Face Confidence: ${liveFaceScore}%`);
    console.log(`[METRIC] Reference Descriptor Compute Time: ${refComputeTime} ms`);
    console.log(`[METRIC] Live Descriptor Compute Time: ${liveComputeTime} ms`);
    console.log(`[METRIC] Euclidean Distance: ${comparison.distance.toFixed(4)}`);
    console.log(`[METRIC] Match Threshold: ${THRESHOLD}`);
    console.log(`[METRIC] Is Match: ${comparison.isMatch}`);
    console.log(`[METRIC] Match Confidence: ${comparison.confidence}%`);
    console.log(`[METRIC] === PERFORMANCE ===`);
    console.log(`[METRIC] Total AI Latency: ${totalLatency} ms`);
    console.log("----------------------------------------------");

    // 9. Return Result (only if both liveness AND face match pass)
    if (comparison.isMatch) {
      res.status(200).json({ 
        verified: true, 
        message: 'Liveness check and face biometric match successful!',
        metrics: {
          livenessCheckPassed: true,
          smileScore: (smileCheck.smileScore * 100).toFixed(2),
          smileCheckTime,
          euclideanDistance: comparison.distance.toFixed(4),
          matchConfidence: comparison.confidence,
          refFaceScore,
          liveFaceScore,
          refComputeTime,
          liveComputeTime,
          totalLatency
        }
      });
    } else {
      res.status(400).json({ 
        verified: false, 
        error: `Face does not match. Distance: ${comparison.distance.toFixed(4)} (threshold: ${THRESHOLD})`,
        metrics: {
          livenessCheckPassed: true,
          smileScore: (smileCheck.smileScore * 100).toFixed(2),
          smileCheckTime,
          euclideanDistance: comparison.distance.toFixed(4),
          matchConfidence: comparison.confidence,
          refFaceScore,
          liveFaceScore,
          totalLatency
        }
      });
    }

  } catch (error) {
    console.error('Error in verifyFace:', error);
    res.status(500).json({ error: 'Face verification failed.', details: error.message });
  }
}
