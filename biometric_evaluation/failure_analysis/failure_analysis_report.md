# LFW Biometric Evaluation - Failure Analysis Report

## Phase 1: Failure characterization

- Failed image entries: 619 (distinct images), all `Inference failed: no face detected`.
- All 619 are valid, readable JPEG (RGB, 250x250). None corrupted/missing/unreadable.
- Identities involved: 539; 250 identities had ALL their images fail.
- Failed pairs: 895; 64 with both images failing; 831 with exactly one image failing (verified).
- Genuine pairs: 3000 total, 422 excluded (14.07%); impostor pairs: 3000 total, 473 excluded (15.77%).
- Genuine image failure rate  vs impostor image failure rate computed via evaluator's computeExclusionBias.

## Phase 2: Detector-sensitivity experiment

face-api.js v0.22.2, ssdMobilenetv1, default native input size, no errors.
minConfidence -> additional images detected (of 619):
- 0.1: 504 (81.4%)
- 0.2: 365 (59.0%)
- 0.3: 250 (40.4%)
- 0.4: 130 (21.0%)
- 0.5 (original default): 0 (0%)

Recovered detections are detection-only; not validated as correct faces or biometric matches.

## Phase 3: Selection-bias assessment

Exclusion rates: genuine 14.07% vs impostor 15.77% (similar). 250 fully-failed identities concentrate exclusion. Limitations: detector failure may correlate with image difficulty/demographics not captured; cannot confirm bias without knowing failure mechanism. Evidence does not strongly support differential bias by pair class.

## Academic-paper claim

Evidence permits: (a) 619/total images failed face detection under default SSD MobileNet V1 (minConfidence 0.5); (b) failures are detection-threshold dependent, not corruption; (c) exclusion rates comparable across genuine/impostor pairs; (d) 250 identities fully excluded. Does not permit claiming validated recovered matches or absence of all selection bias.
"