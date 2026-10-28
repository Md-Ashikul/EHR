# INPUT_NOTES_r2.md

## Schemas
- pairs.csv: pair_id, fold_id, fold_position, is_same, image_a, image_b, image_a_path, image_b_path
- results/biometric_pairs.csv: pair_id, fold_id, fold_position, ground_truth, identity_a, identity_b, ..., distance, prediction_at_0_60, evaluation_status, failure_reason
- results/biometric_thresholds.csv: threshold, tp, tn, fp, fn, far, frr, tar, tnr, accuracy, precision, f1, valid_genuine, valid_impostor, valid_pairs
- results/fold_results.csv: fold_id, selection_status, validation_threshold, held_out_threshold, test_pairs, validation_pairs, train_identity_count, test_identity_count, identity_overlap_count, held_out_* metrics
- results/biometric_summary.csv: metric, value
- results/run_info.json: exit_status, generated_at, pipeline_version, model_config_hash, baseline_threshold, evaluated_pairs, failed_pairs, pair_records, folds, identity_overlap_max

## Known issue in original evaluator
The old exclusion-bias computation counts only fully-failed identities and attributes them to pairs. Genuine pairs require >=2 images of one identity, so fully-failed identities (people whose every image failed) are mostly individuals who can only appear in impostor pairs. This makes the metric non-comparable across genuine/impostor pairs and misleading. Verified from data: only 16 genuine pairs have a fully-failed identity.

## Dataset naming
LFW-funneled images with the official 10-fold pairs.txt. Funneled variant inferred from visible black fill regions; NOT hash-verified against an official archive. Official-pairs check result: rows_ref=6000, rows_csv=6000, identical_order=True, identical_ignore_order=True, identical_swap=True.
"