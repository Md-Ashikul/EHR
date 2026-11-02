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
import { consumeProof, issueRegistrationGrant } from '../../lib/liveness-session';
import path from 'path';
import fs from 'fs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { doctorId, livenessProof } = req.body || {};
    const id = parseInt(doctorId, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid doctor ID.', verified: false });

    // Single-use: the proof is burned here even if the match below fails.
    const { session, error: proofError } = consumeProof(livenessProof, id);
    if (proofError) return res.status(403).json({ error: proofError, verified: false });

    const doctor = readDoctorDB()[id];
    if (!doctor) return res.status(404).json({ error: 'Doctor not found.', verified: false });
    if (doctor.passwordHash !== null) {
      return res.status(400).json({ error: 'This doctor has already completed registration.', verified: false });
    }

    console.log('--- STARTING REAL AI BIOMETRIC VERIFICATION ---');
    const t_start = performance.now();

    await loadModels(path.join(process.cwd(), 'public', 'models'));
    ensureModelsLoaded();

    // Reference photo path comes from the DB, never from the client, and must stay inside /public.
    const publicDir = path.join(process.cwd(), 'public');
    const refPhotoPath = path.resolve(publicDir, String(doctor.referencePhotoUrl || '').replace(/^\//, ''));
    if (!refPhotoPath.startsWith(publicDir + path.sep) || !fs.existsSync(refPhotoPath)) {
      return res.status(404).json({ error: 'Reference photo not found for this doctor.', verified: false });
    }

    const t_refStart = performance.now();
    let refDetection = getCachedRefDescriptor(refPhotoPath);
    if (!refDetection) {
      console.log('[AI] Computing descriptor for reference photo...');
      refDetection = await getFaceDescriptor(bufferToImage(fs.readFileSync(refPhotoPath)));
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

    // Live frame is the one the server stored during the liveness session — the client can't swap it.
    console.log('[AI] Computing descriptor for server-held liveness frame...');
    const t_liveStart = performance.now();
    const liveDetection = await getFaceDescriptor(bufferToImage(await normalizeForDetection(session.finalFrame)));
    const liveComputeTime = (performance.now() - t_liveStart).toFixed(2);

    if (!liveDetection) {
      return res.status(400).json({ error: 'No face detected in liveness frame. Please retry.', verified: false });
    }

    const livenessSessionBinding = compareFaces(new Float32Array(session.anchorDescriptor), liveDetection.descriptor, 0.5);
    if (!livenessSessionBinding.isMatch) {
      return res.status(403).json({
        verified: false,
        error: `Security Alert: Final frame does not match the face that performed the liveness challenges (Distance: ${livenessSessionBinding.distance.toFixed(4)}).`,
      });
    }

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

    const metrics = {
      euclideanDistance: comparison.distance.toFixed(4),
      livenessBindingDistance: livenessSessionBinding.distance.toFixed(4),
      matchConfidence: comparison.confidence,
      refFaceScore,
      liveFaceScore,
      refComputeTime,
      liveComputeTime,
      totalLatency,
    };

    if (!comparison.isMatch) {
      return res.status(400).json({
        verified: false,
        error: `Face does not match. Distance: ${comparison.distance.toFixed(4)} (threshold: ${THRESHOLD})`,
        metrics,
      });
    }

    return res.status(200).json({
      verified: true,
      message: 'Face biometric match successful!',
      registrationToken: issueRegistrationGrant(id),
      metrics,
    });
  } catch (error) {
    console.error('Error in verifyFace:', error);
    return res.status(500).json({ error: 'Face verification failed.', details: error.message, verified: false });
  }
}
