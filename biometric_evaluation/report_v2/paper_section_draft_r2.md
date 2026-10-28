# Paper Section Draft r2

## Dataset and Protocol
LFW-funneled images with the official 10-fold pairs.txt (6,000 pairs; 300 same-person and 300 different-person pairs per fold; no identity shared across folds). Funneled variant inferred from visible black fill regions; not hash-verified.

## Metrics
Accuracy, FAR, FRR, TPR, ROC AUC, EER on evaluated pairs.

## Detection Failures and Pair Exclusion
619 of 7,701 images (8.0%) failed detection; 895 of 6,000 pairs excluded (422 genuine, 473 impostor). Values on evaluated pairs only.

## Threshold Analysis and Justification
0.60 fixed in advance as standard default. Accuracy 97.71% close to CV optimum 97.92%, difference smaller than fold-to-fold sd. 0.60 below EER threshold 0.6483 with FAR 0.47% much lower than FRR 4.07%. Accuracy-based CV selects 0.62-0.63 with higher FAR 1.07%. 0.60 not optimal.

## Limitations
Single benchmark, aligned (funneled) images, excluded pairs, results on detected faces only, no demographic analysis, off-the-shelf model, not directly comparable to published LFW results.

## Liveness / Anti-Spoofing Evaluation
[TO BE WRITTEN BY AUTHOR]
