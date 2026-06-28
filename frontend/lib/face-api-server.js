// Server-side face-api helper for Node.js environment
import * as faceapi from 'face-api.js';
import { Canvas, Image } from 'canvas';
import fetch from 'node-fetch';

// Register canvas with face-api
faceapi.env.monkeyPatch({ Canvas, Image, fetch });

// Global state to track if models are loaded
let modelsLoaded = false;

/**
 * Load face-api models from disk (call once at server startup)
 * @param {string} modelPath - Path to the models directory
 */
export async function loadModels(modelPath) {
  if (modelsLoaded) {
    console.log("[face-api] Models already loaded, skipping...");
    return;
  }

  try {
    console.log("[face-api] Loading models from:", modelPath);
    
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
      faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
      faceapi.nets.faceExpressionNet.loadFromDisk(modelPath),
    ]);

    modelsLoaded = true;
    console.log("[face-api] All models loaded successfully!");
  } catch (error) {
    console.error("[face-api] Error loading models:", error.message);
    throw error;
  }
}

/**
 * Ensure models are loaded before processing
 */
export function ensureModelsLoaded() {
  if (!modelsLoaded) {
    throw new Error('Face-API models not loaded. Call loadModels() first.');
  }
}

/**
 * Convert file buffer to face-api compatible Image
 */
export function bufferToImage(buffer) {
  const img = new Image();
  img.src = buffer;
  return img;
}

/**
 * Extract face descriptor from image
 */
export async function getFaceDescriptor(image) {
  const detection = await faceapi
    .detectSingleFace(image)
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection;
}

/**
 * Compare two face descriptors
 * Returns: { distance, confidence, isMatch }
 */
export function compareFaces(descriptor1, descriptor2, threshold = 0.6) {
  const faceMatcher = new faceapi.FaceMatcher([descriptor1]);
  const match = faceMatcher.findBestMatch(descriptor2);

  const distance = match.distance;
  const isMatch = distance <= threshold;
  const confidence = Math.max(0, Math.round((1 - distance) * 100));

  return { distance, confidence, isMatch };
}

export default {
  loadModels,
  ensureModelsLoaded,
  bufferToImage,
  getFaceDescriptor,
  compareFaces,
  faceapi, // Export faceapi instance for direct use
};
