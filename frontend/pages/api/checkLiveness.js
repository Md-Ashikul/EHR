import { loadModels, ensureModelsLoaded, bufferToImage, getFaceDescriptor } from '../../lib/face-api-server';
import { evaluateAntiSpoofing, calculateEAR, calculateYawRatio, calculateSmileRatio } from '../../lib/liveness-utils';
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
    const { frame, challenge, completedToken, clientMetrics } = req.body;
    if (!frame) return res.status(400).json({ live: false, reason: 'no frame' });

    const MODEL_URL = path.join(process.cwd(), 'public', 'models');
    await loadModels(MODEL_URL);
    ensureModelsLoaded();

    const cleanBase64 = frame.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(cleanBase64, 'base64');
    const img = bufferToImage(buf);

    // FULL 128-D Biometric + 68-Landmark Extraction on EVERY challenge frame (Zero Security Compromise)
    const detection = await getFaceDescriptor(img);
    if (!detection) {
      return res.status(200).json({ live: false, reason: 'No face detected. Keep face centered.', allDone: false, completed: [] });
    }

    const box = detection.detection ? detection.detection.box : detection.box;
    const pad = await evaluateAntiSpoofing(buf, box);
    const landmarks = detection.landmarks;
    const ear = calculateEAR(landmarks);
    const yaw = calculateYawRatio(landmarks);
    const smile = calculateSmileRatio(landmarks);

    let passed = false;
    if (challenge === 'blink') {
      passed = ear < 0.29 || (clientMetrics?.ear && clientMetrics.ear < 0.265);
    } else if (challenge === 'left') {
      passed = yaw > 1.35; // Strictly turn toward YOUR LEFT shoulder
    } else if (challenge === 'right') {
      passed = yaw < 0.74; // Strictly turn toward YOUR RIGHT shoulder
    } else if (challenge === 'smile') {
      passed = smile > 0.41 || (clientMetrics?.happy && clientMetrics.happy > 0.65);
    }

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
      `[LIVENESS] Step=${challenge.toUpperCase()} | EAR=${ear.toFixed(3)} | Yaw=${yaw.toFixed(2)} | Smile=${smile.toFixed(2)} | PAD_Real=${(pad.realScore * 100).toFixed(1)}% | ID_Dist=${identityDistance.toFixed(3)} | Passed=${passed} | Time=${latencyMs}ms | Completed=[${completed.join(',')}]`
    );

    return res.status(200).json({
      live: passed,
      allDone,
      completed,
      ear,
      yaw,
      smile,
      pad,
      token,
      reason: !pad.isReal
        ? `Spoof Detected! (Real Score: ${(pad.realScore * 100).toFixed(0)}%)`
        : passed
        ? 'ok'
        : `Waiting for ${challenge}...`,
    });
  } catch (e) {
    console.error('[checkLiveness CRASH]:', e);
    return res.status(500).json({ live: false, reason: 'Server error: ' + e.message, allDone: false, completed: [] });
  }
}