# Paper Section Draft

## Dataset and Protocol
LFW-funneled images with the official 10-fold pairs.txt (6,000 pairs; 300 same-person and 300 different-person pairs per fold; no identity shared across folds).

## Metrics
We report accuracy, FAR, FRR, TPR, ROC AUC, and EER on the evaluated pairs.

## Detection Failures and Pair Exclusion
Of 7,701 distinct images, 619 (8.0%) failed face detection. Consequently 895 of 6,000 pairs were excluded (422 genuine, 473 impostor). All values apply to evaluated pairs only.

## Threshold Analysis and Justification
The threshold 0.60 was fixed in advance as the standard default for this model family. Accuracy at 0.60 (97.71%) is close to the cross-validated optimum (97.92%) and the difference is smaller than fold-to-fold variation. 0.60 sits below the EER threshold (0.65) with FAR (0.47%) much lower than FRR (4.07%), a security-leaning operating point. Accuracy-based CV selects a slightly higher threshold (0.62-0.63) trading higher FAR (1.07%) for lower FRR (3.06%). 0.60 is not claimed optimal.

## Limitations
Single benchmark, aligned (funneled) images, excluded pairs, results on detected faces only, no demographic analysis, off-the-shelf model, evaluation not directly comparable to published LFW results because of exclusions and a different pipeline.

## Liveness / Anti-Spoofing Evaluation
[TO BE WRITTEN BY AUTHOR]
"