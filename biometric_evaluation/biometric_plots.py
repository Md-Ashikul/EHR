#!/usr/bin/env python3
"""Generate publication-ready figures from biometric evaluator CSV outputs."""

import os
import sys
import csv
import json
import math
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")  # headless backend for a CLI plotter
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent
RESULTS = Path(os.environ.get("BIOMETRIC_RESULTS", str(ROOT / "results")))
PLOTS = Path(os.environ.get("BIOMETRIC_PLOTS", str(ROOT / "plots")))

# ROC curve plotting uses scikit-learn as the computation backend.
# The import is deferred so that gating/figure-counting logic and unit tests remain
# runnable where scikit-learn is absent; ROC figures are then skipped with a warning.
# The evaluator now computes ROC AUC (trapezoidal) independently; plotter uses it for display.
try:
    from sklearn.metrics import roc_curve
    HAS_SKLEARN = True
except ImportError:  # pragma: no cover - environment-dependent
    HAS_SKLEARN = False


def check_run_complete(results_dir):
    """Return (ok, message) stating whether a successful evaluator run is present.

    ok is True only when run_info.json exists in results_dir and its
    exit_status == 'success'. This prevents plotting over stale or partial
    outputs left behind by a failed Node.js evaluation run.
    """
    run_info = Path(results_dir) / "run_info.json"
    if not run_info.exists():
        return (False, "missing results/run_info.json - run the Node.js evaluator first")
    try:
        with run_info.open("r", encoding="utf-8") as fh:
            info = json.load(fh)
    except (OSError, ValueError) as exc:
        return (False, f"results/run_info.json is unreadable: {exc}")
    if info.get("exit_status") != "success":
        return (False, f"evaluator did not complete successfully (exit_status={info.get('exit_status')!r})")
    return (True, "ok")


def read_csv(name):
    file_path = RESULTS / name
    if not file_path.exists():
        print(f"[ERROR] Required CSV missing: {file_path}. Run the Node.js evaluator first.")
        sys.exit(1)
    with file_path.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def f(row, key):
    try: 
        return float(row[key])
    except (ValueError, TypeError, KeyError): 
        return math.nan


def save(fig, name):
    fig.tight_layout()
    fig.savefig(PLOTS / f"{name}.png", dpi=300, bbox_inches='tight')
    fig.savefig(PLOTS / f"{name}.pdf", bbox_inches='tight')
    plt.close(fig)


if __name__ == "__main__":
    print("Generating biometric evaluation plots...")

    PLOTS.mkdir(parents=True, exist_ok=True)
    for plot_file in PLOTS.glob("*"):
        if plot_file.suffix in [".png", ".pdf"]:
            plot_file.unlink()

    ok, msg = check_run_complete(RESULTS)
    if not ok:
        print(f"[ERROR] {msg}")
        sys.exit(2)

    generated = []

    pairs = read_csv('biometric_pairs.csv')
    valid = [r for r in pairs if r.get('evaluation_status') == 'evaluated' and math.isfinite(f(r, 'distance'))]
    thresholds = read_csv('biometric_thresholds.csv')
    summary_list = read_csv('biometric_summary.csv')
    summary = {r['metric']: r['value'] for r in summary_list}

    base = float(summary.get('baseline_threshold', '0.60'))
    
    # Use the new leaky field names
    try:
        selected = float(summary['global_descriptive_leaky_threshold']) if summary.get('global_descriptive_leaky_threshold') else None
    except ValueError:
        selected = None
        
    try:
        eer_threshold = float(summary['eer_threshold']) if summary.get('eer_threshold') else None
    except ValueError:
        eer_threshold = None

    # Read ROC AUC from summary (computed by evaluator)
    try:
        roc_auc = float(summary['roc_auc']) if summary.get('roc_auc') else None
    except ValueError:
        roc_auc = None

    if not valid:
        print("[ERROR] No valid evaluated pairs found in CSV. Exiting.")
        sys.exit(1)

    genuine = np.array([f(r, 'distance') for r in valid if r['ground_truth'] == 'genuine'])
    impostor = np.array([f(r, 'distance') for r in valid if r['ground_truth'] == 'impostor'])
    
    # 1. Genuine vs Impostor Distribution
    fig, ax = plt.subplots(figsize=(8, 5))
    bins = np.linspace(0, max(1.2, max(f(r, 'distance') for r in valid)), 60)
    
    if len(genuine): 
        ax.hist(genuine, bins, alpha=.65, label=f'Genuine (n={len(genuine)})', density=True)
    if len(impostor): 
        ax.hist(impostor, bins, alpha=.65, label=f'Impostor (n={len(impostor)})', density=True)
        
    ax.axvline(base, color='black', ls='--', label=f'Baseline θ={base:.2f}')
    if selected is not None and not math.isnan(selected): 
        ax.axvline(selected, color='tab:green', ls=':', label=f'Global descriptive (leaky) θ={selected:.2f}')
        
    ax.set(xlabel='Euclidean distance (lower = more similar)', ylabel='Density', title='Genuine versus impostor distance distributions')
    ax.legend()
    save(fig, 'genuine_vs_impostor_distribution'); generated.append('genuine_vs_impostor_distribution')

    # 2. ROC / AUC - use evaluator-computed AUC for summary, sklearn only for curve plotting
    y_true = np.array([1 if r['ground_truth'] == 'genuine' else 0 for r in valid])
    # CRITICAL: Euclidean distance is inverted (lower = more similar). Negate for ROC.
    raw_scores = -np.array([f(r, 'distance') for r in valid])
    
    if len(np.unique(y_true)) < 2:
        print("[ERROR] ROC/AUC requires both genuine and impostor evaluated pairs. Halting plotting.")
        sys.exit(1)
        
    roc_ready = HAS_SKLEARN
    if not roc_ready:
        print("[WARN] scikit-learn not installed; skipping ROC curve plot.")
    roc_fpr = roc_tpr = None
    roc_auc_plot = roc_auc
    if roc_ready:
        roc_fpr, roc_tpr, _ = roc_curve(y_true, raw_scores)
        try:
            from sklearn.metrics import roc_auc_score
            roc_auc_plot = roc_auc_score(y_true, raw_scores)
        except Exception:
            roc_auc_plot = roc_auc

    # 3. FAR/FRR vs Threshold
    if thresholds:
        x = np.array([f(r, 'threshold') for r in thresholds])
        far = np.array([f(r, 'far') for r in thresholds])
        frr = np.array([f(r, 'frr') for r in thresholds])

        fig, ax = plt.subplots(figsize=(8, 5))
        ax.plot(x, far, label='FAR')
        ax.plot(x, frr, label='FRR')
        ax.axvline(base, color='black', ls='--', label=f'Baseline θ={base:.2f}')

        if eer_threshold is not None and not math.isnan(eer_threshold):
            ax.axvline(eer_threshold, color='tab:orange', ls=':', label=f'EER θ={eer_threshold:.2f}')
        if selected is not None and not math.isnan(selected):
            ax.axvline(selected, color='tab:green', ls='-.', label=f'Global descriptive (leaky) θ={selected:.2f}')

        ax.set(xlabel='Threshold θ', ylabel='Rate', title='FAR and FRR versus threshold')
        ax.set_ylim(0, 1)
        ax.legend()
        save(fig, 'far_frr_vs_threshold'); generated.append('far_frr_vs_threshold')

        # ROC Curve Plot (scikit-learn; skipped if unavailable or single-class)
        if roc_ready:
            fig, ax = plt.subplots(figsize=(6, 6))
            auc_label = f'ROC curve (AUC={roc_auc_plot:.4f})' if roc_auc_plot is not None else 'ROC curve'
            ax.plot(roc_fpr, roc_tpr, label=auc_label, color='darkorange')
            ax.plot([0, 1], [0, 1], color='gray', ls='--')
            ax.set(xlabel='False positive rate (FAR)', ylabel='True positive rate (TAR)', title='ROC Curve')
            ax.legend(loc='lower right')
            save(fig, 'roc_curve'); generated.append('roc_curve')
        else:
            print("[WARN] ROC curve plot skipped (scikit-learn unavailable).")

        # Threshold Comparison Bar Chart
        selected_row = next((r for r in thresholds if selected is not None and not math.isnan(selected) and abs(f(r, 'threshold') - selected) < 1e-9), None)
        base_row = next((r for r in thresholds if abs(f(r, 'threshold') - base) < 1e-9), None)

        labels = []
        vals = {k: [] for k in ['far', 'frr', 'tar', 'tnr']}

        for label, row in [('Baseline 0.60', base_row), ('Global descriptive (leaky)', selected_row)]:
            if row:
                labels.append(label)
                for k in vals:
                    vals[k].append(f(row, k))

        if labels:
            fig, ax = plt.subplots(figsize=(8, 5))
            pos = np.arange(len(labels))
            width = 0.18

            for i, k in enumerate(vals):
                ax.bar(pos + (i - 1.5) * width, vals[k], width, label=k.upper())

            ax.set_xticks(pos)
            ax.set_xticklabels(labels)
            ax.set_ylim(0, 1.05)
            ax.set_ylabel('Rate')
            ax.set_title('Threshold comparison')
            ax.legend()
            save(fig, 'threshold_comparison'); generated.append('threshold_comparison')

    print(f"[SUCCESS] Generated {len(generated)} figure(s) (PNG/PDF) in {PLOTS}: {', '.join(generated) if generated else 'none'}")