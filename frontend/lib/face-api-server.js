// Server-side face-api helper for Node.js environment
// @vladmandic/face-api's Node build loads @tensorflow/tfjs-node itself and shares ONE tfjs-core with it.
// Never require('@tensorflow/tfjs-node') separately here: a second tfjs-core copy splits the kernel
// registry and face-api ops (e.g. softmax in the expression net) end up "not yet implemented".
import './node-util-shim';
import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image } from 'canvas';
import fetch from 'node-fetch';

// Register canvas with face-api
faceapi.env.monkeyPatch({ Canvas, Image, fetch });

// Global state persisted across Next.js hot reloads
const globalState = globalThis.__faceApiState || (globalThis.__faceApiState = {
  modelsLoaded: false,
  loadingPromise: null,
  refDescriptorCache: new Map(),
});

export async function loadModels(modelPath) {
  if (globalState.modelsLoaded) return;
  if (globalState.loadingPromise) return globalState.loadingPromise;

  globalState.loadingPromise = (async () => {
    try {
      await faceapi.tf.ready();
      console.log(`[face-api] Loading models from: ${modelPath} (tfjs ${faceapi.tf.version_core}, backend=${faceapi.tf.getBackend()})`);
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
        faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
        faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
        faceapi.nets.faceExpressionNet.loadFromDisk(modelPath),
      ]);
      globalState.modelsLoaded = true;
      console.log('[face-api] All models loaded successfully!');
    } catch (error) {
      globalState.loadingPromise = null;
      console.error('[face-api] Error loading models:', error.message);
      throw error;
    }
  })();

  return globalState.loadingPromise;
}

export function ensureModelsLoaded() {
  if (!globalState.modelsLoaded) {
    throw new Error('Face-API models not loaded. Call loadModels() first.');
  }
}

export function bufferToImage(buffer) {
  const img = new Image();
  img.src = buffer;
  return img;
}

// Full Detection + 68 Landmarks + 128-D ResNet Descriptor (Default 0.50 confidence)
export async function getFaceDescriptor(image) {
  return await faceapi
    .detectSingleFace(image)
    .withFaceLandmarks()
    .withFaceDescriptor();
}

export function getCachedRefDescriptor(photoPath) {
  return globalState.refDescriptorCache.get(photoPath) || null;
}

export function setCachedRefDescriptor(photoPath, detection) {
  globalState.refDescriptorCache.set(photoPath, detection);
}

export function compareFaces(descriptor1, descriptor2, threshold = 0.6) {
  const faceMatcher = new faceapi.FaceMatcher([descriptor1]);
  const match = faceMatcher.findBestMatch(descriptor2);

  const distance = match.distance;
  const isMatch = distance <= threshold;
  const confidence = Math.max(0, Math.round((1 - distance) * 100));

  return { distance, confidence, isMatch };
}

export { faceapi };

export default {
  loadModels,
  ensureModelsLoaded,
  bufferToImage,
  getFaceDescriptor,
  getCachedRefDescriptor,
  setCachedRefDescriptor,
  compareFaces,
  faceapi,
};
