# Evaluation Report v2 r2

## Dataset and Protocol
LFW-funneled images with the official 10-fold pairs.txt (6,000 pairs; 300 same-person and 300 different-person pairs per fold; no identity shared across folds). Funneled variant inferred from visible black fill regions; not hash-verified. Official pairs check: rows_ref=6000, rows_csv=6000, identical in order.

## Metrics and Bootstrap
Evaluated pairs: 5,105 (2,578 genuine, 2,527 impostor). Bootstrap: 2000 stratified resamples, seed 42; pairs reuse images so intervals slightly optimistic.

Fixed 0.60: accuracy 97.71%, FAR 0.47%, FRR 4.07%. Bootstrap CI accuracy 97.26-98.10, FAR 0.24-0.75%, FRR 3.33-4.89%.
ROC AUC 0.9934. EER 2.39% at 0.6483 (grid 2.49% at 0.65 footnote).

## Detection Failures
Failed images 619 of 7,701 (8.0%). Excluded pairs 895 (422 genuine 14.07%, 473 impostor 15.77%); 831 one failed image, 64 both. minConfidence recovery: 0.1 81.4%, 0.2 59.0%, 0.3 40.4%, 0.4 21.0%, 0.5 0.0%. Recovered detections not validated.

## Threshold Analysis
Sweep table in tables_v2. CV accuracy: 0.62 x8, 0.63 x2, mean 0.622; pooled accuracy 97.92%, FAR 1.07%, FRR 3.06%; mean fold accuracy 97.92% +/- 0.69. Fixed 0.60 mean fold accuracy 97.71% +/- 0.93. Security rule: 0.56 x9, 0.57 x1; pooled accuracy 95.61%. Justification: 0.60 standard default fixed in advance; accuracy close to CV optimum, difference smaller than fold-to-fold sd; 0.60 below EER threshold with FAR much lower than FRR. Accuracy-based CV selects 0.62-0.63 with higher FAR. 0.60 not optimal.

## Deployment
Deployed verifier uses threshold 0.60 with one-to-one descriptor comparison (distance <= threshold) and default face-api.js SSD MobileNet detector, same as evaluation, but inputs are registration photo and live webcam frame rather than LFW-funneled images.

## Limitations
Single benchmark, aligned (funneled) images, excluded pairs, results on detected faces only, no demographic analysis, off-the-shelf model, not directly comparable to published LFW results.

## Liveness / Anti-Spoofing Evaluation
[TO BE WRITTEN BY AUTHOR]
