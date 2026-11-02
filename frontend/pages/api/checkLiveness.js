import path from 'path';
import { loadModels, ensureModelsLoaded, bufferToImage, faceapi } from '../../lib/face-api-server';
import {
  evaluateAntiSpoofing,
  calculateEAR,
  calculateYawRatio,
  calculateSmileRatio,
  normalizeForDetection,
  measureFaceBrightness,
} from '../../lib/liveness-utils';
import {
  getSession,
  sessionTimeError,
  failSession,
  issueProof,
  frameHash,
  userElapsedMs,
  MAX_FAILURES_PER_STEP,
  GESTURE_WINDOW_MS,
} from '../../lib/liveness-session';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const LOW_LIGHT_LUMA = 70;
const IDENTITY_THRESHOLD = 0.5;
const MAX_FRAME_BYTES = 3 * 1024 * 1024;

// Each gesture must be proven as a MOVEMENT, so the client sends a short burst:
//   blink: [eyes open, eyes closed, eyes re-opened]
//   left/right/smile: [neutral, gesture]
// Timing windows and allowed head movement between frames for each challenge:
const BURST_RULES = {
  blink: { frames: 3, minSpanMs: 40, maxSpanMs: 1500, maxShift: 0.25, sizeRange: [0.85, 1.18] },
  left: { frames: 2, minSpanMs: 120, maxSpanMs: 4000, maxShift: 0.6, sizeRange: [0.75, 1.33] },
  right: { frames: 2, minSpanMs: 120, maxSpanMs: 4000, maxShift: 0.6, sizeRange: [0.75, 1.33] },
  smile: { frames: 2, minSpanMs: 120, maxSpanMs: 4000, maxShift: 0.3, sizeRange: [0.85, 1.18] },
};

const NEUTRAL_YAW = [0.8, 1.25];

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < 128; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

async function analyzeFrame(buf, needExpressions) {
  const img = bufferToImage(await normalizeForDetection(buf));
  const base = faceapi.detectSingleFace(img).withFaceLandmarks();
  const det = needExpressions ? await base.withFaceExpressions().withFaceDescriptor() : await base.withFaceDescriptor();
  if (!det) return null;

  const box = det.detection.box;
  // Anti-spoof runs on the ORIGINAL pixels, never the brightened copy
  const [pad, luma] = await Promise.all([evaluateAntiSpoofing(buf, box), measureFaceBrightness(buf, box)]);
  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    descriptor: Array.from(det.descriptor),
    ear: calculateEAR(det.landmarks),
    yaw: calculateYawRatio(det.landmarks),
    smile: calculateSmileRatio(det.landmarks),
    happy: det.expressions?.happy ?? 0,
    pad,
    luma,
  };
}

function checkGesture(challenge, f) {
  if (challenge === 'blink') {
    const [open1, closed, open2] = f;
    const openMin = Math.min(open1.ear, open2.ear);
    if (openMin < 0.22) return 'Eyes not clearly open before/after the blink.';
    if (closed.ear >= 0.29) return 'Blink not deep enough — close your eyes fully.';
    if (closed.ear > openMin * 0.8) return 'No real eye movement detected — blink naturally.';
    return null;
  }
  const [neutral, gesture] = f;
  if (challenge === 'left' || challenge === 'right') {
    if (neutral.yaw < NEUTRAL_YAW[0] || neutral.yaw > NEUTRAL_YAW[1]) return 'Start by facing the camera straight on.';
    if (challenge === 'left' && gesture.yaw <= 1.35) return 'Turn further toward your LEFT shoulder.';
    if (challenge === 'right' && gesture.yaw >= 0.74) return 'Turn further toward your RIGHT shoulder.';
    return null;
  }
  if (challenge === 'smile') {
    if (neutral.happy >= 0.5) return 'Start with a neutral face, then smile.';
    if (!(gesture.smile > 0.41 || gesture.happy > 0.65)) return 'Smile wider.';
    if (gesture.smile - neutral.smile < 0.02 && gesture.happy - neutral.happy < 0.4) {
      return 'No real smile movement detected.';
    }
    return null;
  }
  return 'Unknown challenge.';
}

// A swapped photo or cut in a video shows up as the face jumping or changing size between frames.
function checkFaceContinuity(rule, f) {
  for (let i = 1; i < f.length; i++) {
    const a = f[i - 1].box;
    const b = f[i].box;
    const avgW = (a.width + b.width) / 2;
    const shift = Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2)) / avgW;
    const sizeRatio = b.width / a.width;
    if (shift > rule.maxShift || sizeRatio < rule.sizeRange[0] || sizeRatio > rule.sizeRange[1]) {
      return 'Face jumped between frames — keep your head steady and in frame.';
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId } = req.body || {};
  const session = getSession(sessionId);
  if (!session || session.status !== 'active') {
    return res.status(200).json({ passed: false, restart: true, reason: 'Liveness session invalid or expired.' });
  }

  const timeError = sessionTimeError(session);
  if (timeError) {
    failSession(session);
    return res.status(200).json({ passed: false, restart: true, reason: timeError });
  }

  // One burst at a time per session: prevents step-advance races and stops parallel
  // requests from inflating processingMs to stretch the time window.
  if (session.busy) {
    return res.status(409).json({ passed: false, reason: 'Previous gesture still being verified.' });
  }
  session.busy = true;
  const t0 = performance.now();
  try {
    return await processBurst(req, res, session, t0);
  } finally {
    session.busy = false;
    session.processingMs += performance.now() - t0;
  }
}

async function processBurst(req, res, session, t0) {
  try {
    const { challenge, frames } = req.body || {};

    const expected = session.challenges[session.step];
    if (challenge !== expected) {
      return res.status(400).json({ passed: false, reason: `Out-of-order challenge. Server expects "${expected}".` });
    }

    const rule = BURST_RULES[challenge];
    if (!Array.isArray(frames) || frames.length !== rule.frames) {
      return res.status(400).json({ passed: false, reason: `Expected ${rule.frames} frames for ${challenge}.` });
    }

    const times = frames.map((fr) => Number(fr?.t));
    const span = times[times.length - 1] - times[0];
    const monotonic = times.every((t, i) => Number.isFinite(t) && (i === 0 || t > times[i - 1]));
    if (!monotonic || span < rule.minSpanMs || span > rule.maxSpanMs) {
      return registerFailure(res, session, challenge, `Movement timing invalid (${Math.round(span)}ms). Perform the gesture in one smooth motion.`);
    }

    const buffers = [];
    const hashes = [];
    for (const fr of frames) {
      if (typeof fr?.image !== 'string') return res.status(400).json({ passed: false, reason: 'Malformed frame.' });
      const buf = Buffer.from(fr.image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      if (buf.length === 0 || buf.length > MAX_FRAME_BYTES) {
        return res.status(400).json({ passed: false, reason: 'Frame too large or empty.' });
      }
      const h = frameHash(buf);
      if (hashes.includes(h) || session.seenFrameHashes.has(h)) {
        return registerFailure(res, session, challenge, 'Replayed or duplicated frame detected.');
      }
      buffers.push(buf);
      hashes.push(h);
    }
    hashes.forEach((h) => session.seenFrameHashes.add(h));

    await loadModels(path.join(process.cwd(), 'public', 'models'));
    ensureModelsLoaded();

    // Sequential on purpose: tfjs-node + onnxruntime share the CPU, parallel runs just thrash.
    const analyzed = [];
    for (const buf of buffers) {
      const a = await analyzeFrame(buf, challenge === 'smile');
      if (!a) return registerFailure(res, session, challenge, 'Face lost during the gesture. Keep your whole face in frame.');
      analyzed.push(a);
    }

    const minPad = Math.min(...analyzed.map((a) => a.pad.realScore));
    const minLuma = Math.min(...analyzed.map((a) => a.luma));

    let identityDistance = 0;
    const reference = session.anchorDescriptor || analyzed[0].descriptor;
    for (const a of analyzed) identityDistance = Math.max(identityDistance, euclidean(reference, a.descriptor));

    const padFailed = analyzed.some((a) => !a.pad.isReal);
    const continuityError = checkFaceContinuity(rule, analyzed);
    const gestureError = checkGesture(challenge, analyzed);
    const identityFailed = identityDistance >= IDENTITY_THRESHOLD;

    console.log(
      `[LIVENESS] Doctor=${session.doctorId} Step=${session.step + 1}/4 ${challenge.toUpperCase()} | ` +
        analyzed
          .map(
            (a, i) =>
              `F${i}[EAR=${a.ear.toFixed(3)} Yaw=${a.yaw.toFixed(2)} Smile=${a.smile.toFixed(2)} Happy=${a.happy.toFixed(2)} PAD=${(a.pad.realScore * 100).toFixed(1)}% Luma=${a.luma.toFixed(0)}]`
          )
          .join(' ') +
        ` | Span=${Math.round(span)}ms | ID_Dist=${identityDistance.toFixed(3)} | PAD_OK=${!padFailed} Continuity_OK=${!continuityError} Gesture_OK=${!gestureError} | ${(performance.now() - t0).toFixed(0)}ms`
    );

    if (identityFailed) {
      console.warn(`[SECURITY ALERT] Identity changed during session for doctor ${session.doctorId} (dist=${identityDistance.toFixed(3)})`);
      failSession(session);
      return res.status(200).json({ passed: false, restart: true, reason: 'Security Alert: Face identity changed mid-challenge! Restarting.' });
    }

    if (padFailed) {
      const reason =
        minLuma < LOW_LIGHT_LUMA
          ? `Anti-spoof check failed in low light (Real ${(minPad * 100).toFixed(0)}%, face brightness ${minLuma.toFixed(0)}/255). Add light in front of your face.`
          : `Spoof Detected! (Real Score: ${(minPad * 100).toFixed(0)}%)`;
      return registerFailure(res, session, challenge, reason, { spoof: true, minPad, minLuma });
    }
    if (continuityError) return registerFailure(res, session, challenge, continuityError);
    if (gestureError) return registerFailure(res, session, challenge, gestureError);

    if (!session.anchorDescriptor) session.anchorDescriptor = analyzed[0].descriptor;
    session.completed.push(challenge);
    session.step += 1;
    session.stepFailures = 0;

    const allDone = session.step >= session.challenges.length;
    let proof = null;
    if (allDone) {
      // Keep the first (frontal/neutral) frame of the final burst server-side for the face match,
      // so the client can't substitute a different image afterwards.
      session.finalFrame = buffers[0];
      proof = issueProof(session);
      console.log(
        `[LIVENESS] Doctor=${session.doctorId} PASSED all challenges [${session.completed.join(', ')}] | ` +
          `user time ${(userElapsedMs(session) / 1000).toFixed(1)}s, server time ${((session.processingMs + performance.now() - t0) / 1000).toFixed(1)}s`
      );
    }

    return res.status(200).json({
      passed: true,
      allDone,
      completed: session.completed,
      nextChallenge: allDone ? null : session.challenges[session.step],
      windowMs: GESTURE_WINDOW_MS,
      proof,
      minPad,
      minLuma,
      reason: 'ok',
    });
  } catch (e) {
    console.error('[checkLiveness CRASH]:', e);
    return res.status(500).json({ passed: false, reason: 'Server error: ' + e.message });
  }
}

function registerFailure(res, session, challenge, reason, extra = {}) {
  session.stepFailures += 1;
  console.log(`[LIVENESS] Doctor=${session.doctorId} ${challenge.toUpperCase()} rejected (${session.stepFailures}/${MAX_FAILURES_PER_STEP}): ${reason}`);
  if (session.stepFailures >= MAX_FAILURES_PER_STEP) {
    failSession(session);
    return res.status(200).json({ passed: false, restart: true, reason: `${reason} Too many failed attempts — restarting with new challenges.`, ...extra });
  }
  return res.status(200).json({ passed: false, completed: session.completed, reason, ...extra });
}
