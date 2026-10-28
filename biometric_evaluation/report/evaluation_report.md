# LFW facial-verification evaluation
Generated: 2026-10-18T21:42:30.407Z

## Methodology & Fold Independence
Pairs and fold assignments were parsed directly from pairs.csv. Person identity was derived from each image filename (LFW convention <identity>_<NNNN>.jpg), not from the images/NNN split segment in the CSV.

Cross-validation follows a leave-one-fold-out protocol using fold_id. For each fold the set of person identities in the held-out test split was compared against the union of person identities in the other 10 training folds. Maximum identity overlap observed across folds: **0**. A non-zero value means the held-out fold shares identities with its training folds, which would violate the identity-independence assumption required for honest cross-validation.

Note: the images/000..images/013 segment in image_a_path/image_b_path is a 14-value split index and does not align 1:1 with the 10 fold_id values. fold_id is treated as the cross-validation protocol field; this file is not asserted to be an official LFW pairs.txt fold assignment.

## Execution status
Evaluated pairs: **5105**. Failures: **895** (recorded in results/image_processing_failures.csv).

## Pooled Cross-Validation
Each fold uses its own data-selected threshold. Pooling per-fold test-set confusion matrices yields a cross-validated aggregate estimate (n=5105 held-out pairs): accuracy **95.612%**, FAR **0.198%**, FRR **8.495%**. This pools heterogeneous thresholds and is a looser estimate than the fixed-baseline single-threshold result.

## Bootstrap Confidence Intervals
1,000 bootstrap resamples at the fixed baseline threshold (θ=0.60). 95% percentile intervals: accuracy **97.551%–97.943%**, FAR **0.357%–0.855%**, FRR **3.331%–4.417%**, AUC **0.9933–0.9953**.

## Exclusion Bias
Image-level failures are not uniformly distributed. **250** of 4281 identities had **all** their images fail face detection (7701 images total, 619 failed). These identities contribute 0.5% of genuine pairs and 12.8% of impostor pairs to the excluded set. Image-level failure rates are 7.8% (genuine) vs 8.1% (impostor), but the concentration of fully-failed identities creates an asymmetric exclusion that should be considered when interpreting the evaluated-pair metrics.

## Validation
Leave-one-fold-out threshold selection requires FRR <= 0.10, applied to the 9 training folds of each split. **This FRR <= 0.10 rule is an operational heuristic for this experiment, not a clinical, regulatory, or security requirement.** Folds failing this constraint: **0 out of 10**. Folds with single-class training data: **0 out of 10**.

The production threshold (data-independent baseline) is 0.6. Data-selected thresholds are distinguished clearly: "global_descriptive_leaky_*" metrics are descriptive only (selected on the full evaluated set, not independently validated; they leak test data and must not be used for deployment), while the per-fold "held_out" metrics are estimated on each fold's held-out test set with the threshold chosen from the other folds.

## Limitations
LFW is an unconstrained face-verification benchmark, not a clinical access-control evaluation. It does not evaluate presentation-attack resistance (liveness), demographic equity, or healthcare security.
