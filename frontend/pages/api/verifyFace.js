import { readDoctorDB } from '../../lib/db-handler';
import {
  loadModels,
  ensureModelsLoaded,
  bufferToImage,
  getFaceDescriptor,
  getCachedRefDescriptor,
  setCachedRefDescriptor,
  compareFaces,
} from '../../lib/face-api-server';
import { normalizeForDetection } from '../../lib/liveness-utils';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { doctorId, referencePhotoUrl, liveImageBase64, livenessToken } = req.body;
  const LIV_SECRET = process.env.LIVENESS_SECRET || 'ehr-biometric-liveness-hmac-secret-2026';

  if (!livenessToken) {
    return res.status(403).json({ error: 'Liveness proof missing.', verified: false });
  }

  let tokenData;
  try {
    const [payload, sig] = livenessToken.split('.');
    const expected = crypto.createHmac('sha256', LIV_SECRET).update(payload).digest('hex');
    if (sig !== expected) {
      return res.status(403).json({ error: 'Invalid liveness proof signature.', verified: false });
    }
    tokenData = JSON.parse(Buffer.from(payload, 'base64').toString());
    if (Date.now() - tokenData.ts > 60000) {
      return res.status(403).json({ error: 'Liveness proof expired.', verified: false });
    }
    if (!tokenData.allDone || !tokenData.anchorDescriptor) {
      return res.status(403).json({
        error: 'All 4 liveness challenges (blink, left, right, smile) and identity lock must be completed.',
        verified: false,
      });
    }
  } catch (e) {
    return res.status(403).json({ error: 'Malformed liveness proof.', verified: false });
  }

  const doctorDatabase = readDoctorDB();

  try {
    console.log('--- STARTING REAL AI BIOMETRIC VERIFICATION ---');
    const t_start = performance.now();

    if (!doctorId || !referencePhotoUrl || !liveImageBase64) {
      return res.status(400).json({ error: 'Missing doctor ID, reference photo, or live image.' });
    }

    const id = parseInt(doctorId, 10);
    const doctor = doctorDatabase[id];
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }

    const MODEL_URL = path.join(process.cwd(), 'public', 'models');
    await loadModels(MODEL_URL);
    ensureModelsLoaded();

    const refPhotoPath = path.join(process.cwd(), 'public', referencePhotoUrl.replace(/^\//, ''));
    if (!fs.existsSync(refPhotoPath)) {
      return res.status(404).json({ error: `Reference photo not found at ${refPhotoPath}` });
    }

    // 1. Compute (or retrieve cached) Reference Photo Descriptor
    const t_refStart = performance.now();
    let refDetection = getCachedRefDescriptor(refPhotoPath);
    if (!refDetection) {
      console.log('[AI] Computing descriptor for reference photo...');
      const refImageBuffer = fs.readFileSync(refPhotoPath);
      const refImage = bufferToImage(refImageBuffer);
      refDetection = await getFaceDescriptor(refImage);
      if (refDetection) setCachedRefDescriptor(refPhotoPath, refDetection);
    } else {
      console.log('[AI] Using cached reference photo descriptor (0ms)...');
    }
    const refComputeTime = (performance.now() - t_refStart).toFixed(2);

    if (!refDetection) {
      return res.status(400).json({
        error: 'No face detected in reference photo. Admin must update the reference photo.',
        verified: false,
      });
    }

    // 2. Compute Live Image Descriptor
    console.log('[AI] Computing descriptor for live image...');
    const t_liveStart = performance.now();
    const base64Data = liveImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const liveImageBuffer = Buffer.from(base64Data, 'base64');
    // Same preprocessing as /api/checkLiveness so the anchor descriptor and this one are comparable
    const liveImage = bufferToImage(await normalizeForDetection(liveImageBuffer));
    const liveDetection = await getFaceDescriptor(liveImage);
    const liveComputeTime = (performance.now() - t_liveStart).toFixed(2);

    if (!liveDetection) {
      return res.status(400).json({
        error: 'No face detected in live image. Please position your face clearly.',
        verified: false,
      });
    }

    // 3. Verify Cryptographic Binding Between Liveness Session Face & Final Verification Face
    const anchorFloat32 = new Float32Array(tokenData.anchorDescriptor);
    const livenessSessionBinding = compareFaces(anchorFloat32, liveDetection.descriptor, 0.50);
    if (!livenessSessionBinding.isMatch) {
      return res.status(403).json({
        verified: false,
        error: `Security Alert: Final frame does not match the face that performed the liveness challenges (Distance: ${livenessSessionBinding.distance.toFixed(4)}).`,
      });
    }

    // 4. Compare Live Descriptor Against Doctor's Enrolled Reference Photo
    const THRESHOLD = 0.6;
    const comparison = compareFaces(refDetection.descriptor, liveDetection.descriptor, THRESHOLD);

    const refFaceScore = (refDetection.detection.score * 100).toFixed(2);
    const liveFaceScore = (liveDetection.detection.score * 100).toFixed(2);
    const totalLatency = (performance.now() - t_start).toFixed(2);

    console.log(`[METRIC] Reference Face Confidence: ${refFaceScore}%`);
    console.log(`[METRIC] Live Face Confidence: ${liveFaceScore}%`);
    console.log(`[METRIC] Reference Descriptor Compute Time: ${refComputeTime} ms`);
    console.log(`[METRIC] Live Descriptor Compute Time: ${liveComputeTime} ms`);
    console.log(`[METRIC] Liveness Anchor Binding Distance: ${livenessSessionBinding.distance.toFixed(4)}`);
    console.log(`[METRIC] Euclidean Distance: ${comparison.distance.toFixed(4)}`);
    console.log(`[METRIC] Match Threshold: ${THRESHOLD}`);
    console.log(`[METRIC] Is Match: ${comparison.isMatch}`);
    console.log(`[METRIC] Match Confidence: ${comparison.confidence}%`);
    console.log(`[METRIC] Total AI Latency: ${totalLatency} ms`);
    console.log('----------------------------------------------');

    if (comparison.isMatch) {
      return res.status(200).json({
        verified: true,
        message: 'Face biometric match successful!',
        metrics: {
          euclideanDistance: comparison.distance.toFixed(4),
          livenessBindingDistance: livenessSessionBinding.distance.toFixed(4),
          matchConfidence: comparison.confidence,
          refFaceScore,
          liveFaceScore,
          refComputeTime,
          liveComputeTime,
          totalLatency,
        },
      });
    } else {
      return res.status(400).json({
        verified: false,
        error: `Face does not match. Distance: ${comparison.distance.toFixed(4)} (threshold: ${THRESHOLD})`,
        metrics: {
          euclideanDistance: comparison.distance.toFixed(4),
          matchConfidence: comparison.confidence,
          refFaceScore,
          liveFaceScore,
          totalLatency,
        },
      });
    }
  } catch (error) {
    console.error('Error in verifyFace:', error);
    return res.status(500).json({ error: 'Face verification failed.', details: error.message });
  }
}
