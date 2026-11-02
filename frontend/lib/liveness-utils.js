import * as ortNamespace from 'onnxruntime-node';
import sharp from 'sharp';
import path from 'path';

const ort = ortNamespace.default || ortNamespace;

const globalPadState = globalThis.__padState || (globalThis.__padState = {
  padSession27: null,
  padSession40: null,
  loadingPromise: null,
});

export async function getPadSessions() {
  if (globalPadState.padSession27 && globalPadState.padSession40) {
    return {
      padSession27: globalPadState.padSession27,
      padSession40: globalPadState.padSession40,
    };
  }

  if (globalPadState.loadingPromise) {
    return globalPadState.loadingPromise;
  }

  globalPadState.loadingPromise = (async () => {
    const modelPath27 = path.join(process.cwd(), 'server_models', 'pad', 'MiniFASNetV2_2.7.onnx');
    const modelPath40 = path.join(process.cwd(), 'server_models', 'pad', 'MiniFASNetV1SE_4.0.onnx');
    console.log('[PAD] Loading ONNX models (2.7x & 4.0x) once...');
    const [s27, s40] = await Promise.all([
      ort.InferenceSession.create(modelPath27),
      ort.InferenceSession.create(modelPath40),
    ]);
    globalPadState.padSession27 = s27;
    globalPadState.padSession40 = s40;
    console.log('[PAD] Both ONNX anti-spoofing models ready!');
    return { padSession27: s27, padSession40: s40 };
  })();

  return globalPadState.loadingPromise;
}

function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sumExps);
}

function getExpandedBox(box, imgWidth, imgHeight, scale) {
  const x = box.x ?? box.left ?? 0;
  const y = box.y ?? box.top ?? 0;
  const width = box.width ?? 100;
  const height = box.height ?? 100;

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const maxAllowedSize = Math.min(imgWidth, imgHeight);
  const rawSize = Math.max(width, height) * scale;
  const size = Math.max(16, Math.min(Math.floor(maxAllowedSize), Math.floor(rawSize)));

  let left = Math.floor(centerX - size / 2);
  let top = Math.floor(centerY - size / 2);

  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (left + size > imgWidth) left = Math.max(0, imgWidth - size);
  if (top + size > imgHeight) top = Math.max(0, imgHeight - size);

  return {
    left: Math.floor(left),
    top: Math.floor(top),
    width: Math.min(size, imgWidth - Math.floor(left)),
    height: Math.min(size, imgHeight - Math.floor(top)),
  };
}

async function preprocessForMiniFASNet(imageBuffer, faceBox, scale) {
  const metadata = await sharp(imageBuffer).metadata();
  const cropBox = getExpandedBox(faceBox, metadata.width, metadata.height, scale);

  const { data } = await sharp(imageBuffer)
    .extract(cropBox)
    .resize(80, 80, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32Data = new Float32Array(3 * 80 * 80);
  const area = 80 * 80;
  for (let i = 0; i < area; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    float32Data[i] = b;            // Channel 0: Blue
    float32Data[area + i] = g;     // Channel 1: Green
    float32Data[2 * area + i] = r; // Channel 2: Red
  }
  return new ort.Tensor('float32', float32Data, [1, 3, 80, 80]);
}

export async function evaluateAntiSpoofing(imageBuffer, faceBox) {
  const { padSession27, padSession40 } = await getPadSessions();
  const tensor27 = await preprocessForMiniFASNet(imageBuffer, faceBox, 2.7);
  const tensor40 = await preprocessForMiniFASNet(imageBuffer, faceBox, 4.0);

  const out27 = await padSession27.run({ [padSession27.inputNames[0]]: tensor27 });
  const out40 = await padSession40.run({ [padSession40.inputNames[0]]: tensor40 });

  const probs27 = softmax(Array.from(out27[padSession27.outputNames[0]].data));
  const probs40 = softmax(Array.from(out40[padSession40.outputNames[0]].data));

  // Official Strict 50/50 Dual-Scale Fusion & 0.85 Threshold (Zero Security Compromise)
  const realScore = (probs27[1] + probs40[1]) / 2;
  const printSpoofScore = (probs27[0] + probs40[0]) / 2;
  const replaySpoofScore = (probs27[2] + probs40[2]) / 2;

  return {
    isReal: realScore > 0.85,
    realScore,
    printSpoofScore,
    replaySpoofScore,
  };
}

const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

export function calculateEAR(landmarks) {
  const pts = landmarks.positions;
  const leftEAR = (dist(pts[37], pts[41]) + dist(pts[38], pts[40])) / (2.0 * dist(pts[36], pts[39]));
  const rightEAR = (dist(pts[43], pts[47]) + dist(pts[44], pts[46])) / (2.0 * dist(pts[42], pts[45]));
  return (leftEAR + rightEAR) / 2.0;
}

export function calculateYawRatio(landmarks) {
  const pts = landmarks.positions;
  const noseTip = pts[30];
  const leftEdge = pts[1];
  const rightEdge = pts[15];
  const dLeft = dist(noseTip, leftEdge);
  const dRight = dist(noseTip, rightEdge);
  return dLeft / (dRight + 1e-6);
}

export function calculateSmileRatio(landmarks) {
  const pts = landmarks.positions;
  const mouthWidth = dist(pts[48], pts[54]);
  const jawWidth = dist(pts[3], pts[13]);
  return mouthWidth / (jawWidth + 1e-6);
}