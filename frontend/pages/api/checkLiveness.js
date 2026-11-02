import { loadModels, ensureModelsLoaded, bufferToImage, faceapi } from '../../lib/face-api-server';
import {
  evaluateAntiSpoofing,
  calculateEAR,
  calculateYawRatio,
  calculateSmileRatio,
  normalizeForDetection,
  measureFaceBrightness,
} from '../../lib/liveness-utils';

const ALLOWED_CHALLENGES = ['blink', 'left', 'right', 'smile'];
const LOW_LIGHT_LUMA = 70;
import crypto from 'crypto';
import path from 'path';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const t0 = performance.now();
    const { frame, challenge, completedToken } = req.body;
    if (!frame) return res.status(400).json({ live: false, reason: 'no frame' });
    if (!ALLOWED_CHALLENGES.includes(challenge)) {
      return res.status(400).json({ live: false, reason: 'invalid challenge', allDone: false, completed: [] });
    }

    const MODEL_URL = path.join(process.cwd(), 'public', 'models');
    await loadModels(MODEL_URL);
    ensureModelsLoaded();

    const cleanBase64 = frame.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(cleanBase64, 'base64');
    const detectBuf = await normalizeForDetection(buf);
    const img = bufferToImage(detectBuf);

    // FULL 128-D Biometric + 68-Landmark Extraction on EVERY challenge frame (strict 0.50 SSD confidence)
    const baseTask = faceapi.detectSingleFace(img).withFaceLandmarks();
    const detection =
      challenge === 'smile'
        ? await baseTask.withFaceExpressions().withFaceDescriptor()
        : await baseTask.withFaceDescriptor();

    if (!detection) {
      console.log(`[LIVENESS] Step=${challenge.toUpperCase()} | No face detected on server (frame rejected)`);
      return res.status(200).json({ live: false, reason: 'No face detected. Keep face centered.', allDone: false, completed: [] });
    }

    const box = detection.detection.box;
    // Gate 1 input: PAD runs on the ORIGINAL pixels, never the normalized copy
    const [pad, faceLuma] = await Promise.all([evaluateAntiSpoofing(buf, box), measureFaceBrightness(buf, box)]);
    const landmarks = detection.landmarks;
    const ear = calculateEAR(landmarks);
    const yaw = calculateYawRatio(landmarks);
    const smile = calculateSmileRatio(landmarks);
    const happy = detection.expressions?.happy ?? 0;

    // Every decision uses server-computed values only — client metrics are never trusted.
    let passed = false;
    if (challenge === 'blink') {
      passed = ear < 0.29;
    } else if (challenge === 'left') {
      passed = yaw > 1.35; // Strictly turn toward YOUR LEFT shoulder
    } else if (challenge === 'right') {
      passed = yaw < 0.74; // Strictly turn toward YOUR RIGHT shoulder
    } else if (challenge === 'smile') {
      passed = smile > 0.41 || happy > 0.65;
    }
    const gesturePassed = passed;

    // Gate 1: Dual-Scale ONNX MiniFASNet Anti-Spoofing must pass on EVERY step
    if (!pad.isReal) {
      passed = false;
    }

    const LIV_SECRET = process.env.LIVENESS_SECRET || 'ehr-biometric-liveness-hmac-secret-2026';
    let completed = [];
    let anchorDescriptor = null;

    if (completedToken) {
      try {
        const [payload, sig] = completedToken.split('.');
        const expected = crypto.createHmac('sha256', LIV_SECRET).update(payload).digest('hex');
        if (sig === expected) {
          const data = JSON.parse(Buffer.from(payload, 'base64').toString());
          if (Date.now() - data.ts < 180000) {
            completed = data.completed || [];
            anchorDescriptor = data.anchorDescriptor || null;
          }
        }
      } catch (e) {}
    }

    // Gate 2: Strict 128-D Biometric Identity Continuity Across All Steps
    const currentDesc = Array.from(detection.descriptor);
    let identityDistance = 0;

    if (anchorDescriptor && anchorDescriptor.length === 128) {
      let sum = 0;
      for (let i = 0; i < 128; i++) {
        sum += (currentDesc[i] - anchorDescriptor[i]) ** 2;
      }
      identityDistance = Math.sqrt(sum);

      // If someone swaps faces/photos mid-challenge, reject and wipe progress!
      if (identityDistance >= 0.50) {
        console.warn(`[SECURITY ALERT] Identity swap detected at step ${challenge}! Distance=${identityDistance.toFixed(4)}`);
        return res.status(200).json({
          live: false,
          allDone: false,
          completed: [],
          token: null,
          reason: 'Security Alert: Face identity changed mid-challenge! Restarting.',
        });
      }
    } else if (passed) {
      // Lock the 128-D biometric identity on Step 1 (Blink)
      anchorDescriptor = currentDesc;
    }

    if (passed && !completed.includes(challenge)) {
      completed.push(challenge);
    }

    const allDone = ['blink', 'left', 'right', 'smile'].every((c) => completed.includes(c));

    let token = completedToken || null;
    if (passed) {
      const payloadObj = { ts: Date.now(), completed, anchorDescriptor, allDone };
      const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64');
      const sig = crypto.createHmac('sha256', LIV_SECRET).update(payload).digest('hex');
      token = `${payload}.${sig}`;
    }

    const latencyMs = (performance.now() - t0).toFixed(0);
    console.log(
      `[LIVENESS] Step=${challenge.toUpperCase()} | EAR=${ear.toFixed(3)} | Yaw=${yaw.toFixed(2)} | Smile=${smile.toFixed(2)} | Happy=${happy.toFixed(2)} | FaceLuma=${faceLuma.toFixed(0)} | PAD_Real=${(pad.realScore * 100).toFixed(1)}% (print=${(pad.printSpoofScore * 100).toFixed(1)}% replay=${(pad.replaySpoofScore * 100).toFixed(1)}%) | Gesture=${gesturePassed} | ID_Dist=${identityDistance.toFixed(3)} | Passed=${passed} | Time=${latencyMs}ms | Completed=[${completed.join(',')}]`
    );

    const tooDark = faceLuma < LOW_LIGHT_LUMA;
    let reason = 'ok';
    if (!pad.isReal) {
      reason = tooDark
        ? `Anti-spoof check failed in low light (Real ${(pad.realScore * 100).toFixed(0)}%, face brightness ${faceLuma.toFixed(0)}/255). Add light in front of your face.`
        : `Spoof Detected! (Real Score: ${(pad.realScore * 100).toFixed(0)}%)`;
    } else if (!gesturePassed) {
      reason = `Server did not confirm ${challenge} — try again${challenge === 'blink' ? ' with a full, deliberate blink' : ''}.`;
    }

    return res.status(200).json({
      live: passed,
      allDone,
      completed,
      ear,
      yaw,
      smile,
      pad,
      faceLuma,
      token,
      reason,
    });
  } catch (e) {
    console.error('[checkLiveness CRASH]:', e);
    return res.status(500).json({ live: false, reason: 'Server error: ' + e.message, allDone: false, completed: [] });
  }
}
