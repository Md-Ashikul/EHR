# Evaluation Report v2

Generated from numbers_v2.json.

## Dataset and Protocol
LFW-funneled images with the official 10-fold pairs.txt (6,000 pairs; 300 same-person and 300 different-person pairs per fold; no identity shared across folds).

## Metrics
Evaluated pairs: 5,105 (2,578 genuine, 2,527 impostor). Excluded: 895.

Fixed 0.60: accuracy 97.71%, FAR 0.47%, FRR 4.07%. Bootstrap CI accuracy 97.26-98.10.
ROC AUC 0.9934. EER 2.49% at 0.65.

CV accuracy selection: thresholds 0.62 (8 folds), 0.63 (2 folds), mean 0.622. Pooled accuracy 97.92%, FAR 1.07%, FRR 3.06%. Mean fold accuracy 97.92% +/- 0.69. Fixed 0.60 mean fold accuracy 97.71% +/- 0.93.

Security rule: 0.56 (9 folds), 0.57 (1). Pooled accuracy 95.61%.

## Detection Failures and Pair Exclusion
Failed images: 619 of 7,701 (8.0%). Identities all images failed: 250. Excluded pairs: 895 (422 genuine 14.07%, 473 impostor 15.77%). 831 one failed image, 64 both.

## Liveness / Anti-Spoofing Evaluation
[TO BE WRITTEN BY AUTHOR]

## Limitations
Single benchmark, aligned (funneled) images, excluded pairs, results on detected faces only, no demographic analysis, off-the-shelf model, not directly comparable to published LFW results.
"