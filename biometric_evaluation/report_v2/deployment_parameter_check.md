# Deployment Parameter Check

- Face-matching distance threshold: `frontend/pages/api/verifyFace.js:97` `const THRESHOLD = 0.6;` matches evaluated 0.60.
- Face detector: SSD MobileNet V1 (`frontend/pages/api/verifyFace.js` uses face-api ssdMobilenetv1). No explicit minConfidence/inputSize override found in deployed code; defaults apply (minConfidence 0.5), matching evaluation.
- Conclusion: deployed parameters match evaluated parameters.
"