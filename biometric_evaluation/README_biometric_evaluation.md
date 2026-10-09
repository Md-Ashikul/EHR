# Reproducible LFW biometric evaluation

This directory contains an independent evaluation of the EHR face-verification pipeline. It does not modify production authentication code, `pairs.csv`, the LFW images, or the production models.

## Inputs and provenance

- Dataset: repository-root `lfw_images`.
- Pair file: `biometric_evaluation/pairs.csv`.
- Models: `frontend/public/models`.
- Pipeline: SSD MobileNet V1 detection, 68-point landmarks, FaceRecognitionNet 128-dimensional descriptors, Euclidean distance.

The supplied CSV has 6,000 records, 3,000 genuine and 3,000 impostor labels, and ten folds of 600 records in this checkout. Those properties are consistent with the official LFW protocol, but the file itself does not establish provenance; the evaluator therefore reports it as an LFW-derived pair list unless external provenance is supplied.

## Windows PowerShell

From `C:\EHR`:

```powershell
node .\biometric_evaluation\biometric_eval_lfw.js
python .\biometric_evaluation\biometric_plots.py
```

The project already declares `face-api.js` and `canvas`. Python plotting requires `numpy` and `matplotlib` (optionally `scikit-learn` for independent analysis). Install missing packages with `py -m pip install numpy matplotlib scikit-learn`.

## Validation and methodology

The Node evaluator validates CSV columns, labels, pair IDs, folds, identity labels, path resolution, and image availability before inference. It sweeps thresholds from 0.00 to 1.20 in 0.01 increments and applies `distance <= threshold` as the match rule. FAR, FRR, TAR, TNR, accuracy, precision, and F1 use only valid comparisons and explicit null values for zero denominators.

For each fold, all other folds are validation data and the held-out fold is test data. The validation heuristic selects the lowest FAR among thresholds with FRR <= 0.10; this usability constraint is an explicit benchmark heuristic, not a clinical requirement. EER is reported separately and is not automatically treated as the deployment threshold. The plotting script computes ROC-AUC from measured distances with smaller distances treated as more genuine.

## Cache and failures

Descriptors are cached under `cache/metadata.json`, keyed by stable repository-relative image path and checked against model configuration, image size, modification time, and SHA-256. Delete `cache` to force recomputation. Images with no detectable face, unreadable files, or runtime failures are recorded in `results/image_processing_failures.csv`; no distance is fabricated.

## Outputs

- `results/biometric_pairs.csv`: pair-level paths, labels, distances, baseline prediction, and status.
- `results/biometric_thresholds.csv`: complete threshold sweep and confusion-matrix metrics.
- `results/fold_results.csv`: leave-one-fold-out validation threshold and held-out metrics.
- `results/biometric_summary.csv`: measured counts and headline metrics.
- `results/image_processing_failures.csv`: processing failures and affected paths.
- `plots/`: four figures, each PNG at 300 DPI and PDF.
- `report/evaluation_report.md`: generated research report.

## Interpretation and limitations

The report answers whether the validation-selected threshold improves held-out metrics over 0.60 only when the dataset, models, and valid comparisons are available. LFW does not establish healthcare-specific security, liveness, presentation-attack resistance, demographic fairness, or clinical authorization suitability. Pair comparisons may share images, so simple independent-observation confidence intervals can be misleading; this implementation does not invent confidence intervals. Always validate any operational threshold on representative, consented, application-specific data.

Record Node/Python/package versions and model file changes when publishing results. The current checkout should honestly be reported as unexecuted for inference if `lfw_images` is absent; the evaluator still emits validation artifacts and failure records rather than claiming a complete benchmark.
