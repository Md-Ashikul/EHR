#!/usr/bin/env python3
"""Tests for biometric_plots.py: run-completion gating and figure counting.

These tests do NOT require scikit-learn. ROC/AUC are skipped gracefully when
sklearn is absent, so gating and the non-ROC figures can be exercised here.
The full ROC/AUC path is only runnable in an env that has scikit-learn installed.
"""
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import biometric_plots as bp


def write_run_info(d, status="success", extra=None):
    info = {"exit_status": status, "generated_at": "2026-01-01T00:00:00Z"}
    if extra:
        info.update(extra)
    (d / "run_info.json").write_text(json.dumps(info), encoding="utf-8")


def write_csv(name, rows, d):
    path = d / name
    fields = list(rows[0].keys()) if rows else []
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return path


def synthetic_results(d):
    # 6 genuine (low distance) + 6 impostor (high distance)
    pairs = []
    for i in range(6):
        pairs.append({"pair_id": i, "fold_id": 1, "fold_position": i,
                      "ground_truth": "genuine", "identity_a": f"ID{i}", "identity_b": f"ID{i}",
                      "image_a_path": f"ID{i}/ID{i}_0001.jpg", "image_b_path": f"ID{i}/ID{i}_0002.jpg",
                      "resolved_path_a": f"lfw_images/ID{i}/ID{i}_0001.jpg",
                      "resolved_path_b": f"lfw_images/ID{i}/ID{i}_0002.jpg",
                      "path_resolution": "identity/identity",
                      "distance": 0.20 + 0.03 * i, "prediction_at_0_60": "match",
                      "evaluation_status": "evaluated", "failure_reason": ""})
    for i in range(6):
        pairs.append({"pair_id": 100 + i, "fold_id": 1, "fold_position": 100 + i,
                      "ground_truth": "impostor", "identity_a": f"IA{i}", "identity_b": f"IB{i}",
                      "image_a_path": f"IA{i}/IA{i}_0001.jpg", "image_b_path": f"IB{i}/IB{i}_0001.jpg",
                      "resolved_path_a": f"lfw_images/IA{i}/IA{i}_0001.jpg",
                      "resolved_path_b": f"lfw_images/IB{i}/IB{i}_0001.jpg",
                      "path_resolution": "identity/identity",
                      "distance": 0.70 + 0.03 * i, "prediction_at_0_60": "non-match",
                      "evaluation_status": "evaluated", "failure_reason": ""})
    write_csv("biometric_pairs.csv", pairs, d)

    # threshold rows including 0.55 and 0.60
    rows = []
    t = 0.0
    while t <= 1.21:
        far = min(1.0, max(0.0, (t - 0.6) / 0.6))
        frr = min(1.0, max(0.0, (0.6 - t) / 0.6))
        rows.append({"threshold": f"{t:.2f}", "far": f"{far:.6f}", "frr": f"{frr:.6f}",
                     "tar": f"{1-frr:.6f}", "tnr": f"{1-far:.6f}", "accuracy": "0.75",
                     "precision": "0.8", "f1": "0.85", "valid_genuine": "6",
                     "valid_impostor": "6", "valid_pairs": "12"})
        t += 0.05
    write_csv("biometric_thresholds.csv", rows, d)

    # Use new leaky field names
    write_csv("biometric_summary.csv", [
        {"metric": "pair_records", "value": "12"},
        {"metric": "valid_evaluated_pairs", "value": "12"},
        {"metric": "failed_pairs", "value": "0"},
        {"metric": "genuine_pairs_evaluated", "value": "6"},
        {"metric": "impostor_pairs_evaluated", "value": "6"},
        {"metric": "identity_overlap_max", "value": "0"},
        {"metric": "baseline_threshold", "value": "0.60"},
        {"metric": "baseline_far", "value": "0.2"},
        {"metric": "baseline_frr", "value": "0.3"},
        {"metric": "baseline_accuracy", "value": "0.75"},
        {"metric": "eer", "value": "0.4"},
        {"metric": "eer_threshold", "value": "0.55"},
        {"metric": "global_descriptive_leaky_threshold", "value": "0.55"},
        {"metric": "global_descriptive_leaky_far", "value": "0.15"},
        {"metric": "global_descriptive_leaky_frr", "value": "0.25"},
        {"metric": "roc_auc", "value": ""},
    ], d)


def run_plotter(results_dir, plots_dir):
    env = dict(os.environ)
    env["BIOMETRIC_RESULTS"] = str(results_dir)
    env["BIOMETRIC_PLOTS"] = str(plots_dir)
    return subprocess.run([sys.executable, "-u", str(Path(bp.__file__).resolve())],
                          capture_output=True, text=True, env=env)


def main():
    passed = 0
    failed = 0

    def check(name, cond, detail=""):
        nonlocal passed, failed
        if cond:
            print(f"  ok - {name}")
            passed += 1
        else:
            print(f"  FAIL - {name} {detail}")
            failed += 1

    print("Python gate + figure tests")

    # --- unit tests for check_run_complete ---
    d = Path(tempfile.mkdtemp())
    try:
        ok, msg = bp.check_run_complete(d)
        check("missing run_info.json -> not ok", ok is False and "missing" in msg, msg)

        write_run_info(d, "success")
        ok, msg = bp.check_run_complete(d)
        check("exit_status=success -> ok", ok is True, msg)

        write_run_info(d, "failed")
        ok, msg = bp.check_run_complete(d)
        check("exit_status=failed -> not ok", ok is False, msg)

        # malformed JSON
        (d / "run_info.json").write_text("{not json", encoding="utf-8")
        ok, msg = bp.check_run_complete(d)
        check("malformed run_info.json -> not ok", ok is False, msg)
    finally:
        shutil.rmtree(d, ignore_errors=True)

    # --- end-to-end: missing manifest -> exit code 2 ---
    d = Path(tempfile.mkdtemp())
    p = d / "plots"
    p.mkdir()
    try:
        synthetic_results(d)  # CSVs present but NO run_info.json
        res = run_plotter(d, p)
        check("no manifest -> exit 2", res.returncode == 2,
              f"rc={res.returncode} stderr={res.stderr.strip()[:120]}")
        check("no manifest -> error mentions run_info", "run_info" in (res.stderr + res.stdout),
              (res.stderr + res.stdout)[:120])
    finally:
        shutil.rmtree(d, ignore_errors=True)

    # --- end-to-end: success manifest -> exit 0, dynamic figure count ---
    d = Path(tempfile.mkdtemp())
    p = d / "plots"
    p.mkdir()
    try:
        synthetic_results(d)
        write_run_info(d, "success", {"evaluated_pairs": 12, "baseline_threshold": 0.60})
        res = run_plotter(d, p)
        check("success manifest -> exit 0", res.returncode == 0,
              f"rc={res.returncode} stderr={res.stderr.strip()[:200]}")
        # Figure count must be reported dynamically, not hard-coded to 3 or 4.
        check("figure count reported dynamically (not hard-coded)",
              "Generated " in res.stdout and "figure(s)" in res.stdout,
              res.stdout[-200:])
        actual = {f.name for f in p.glob("*.png")}
        expected_without_roc = {"genuine_vs_impostor_distribution.png",
                                "far_frr_vs_threshold.png",
                                "threshold_comparison.png"}
        expected_with_roc = expected_without_roc | {"roc_curve.png"}
        if bp.HAS_SKLEARN:
            check("sklearn present -> 4 figures", actual == expected_with_roc, str(actual))
        else:
            check("sklearn absent -> 3 figures (ROC skipped)", actual == expected_without_roc, str(actual))
        # AUC must NOT be silently invented when ROC was skipped
        summary = {r["metric"]: r["value"] for r in csv.DictReader((d / "biometric_summary.csv").open())}
        check("roc_auc left blank when ROC skipped", summary.get("roc_auc") == "", summary.get("roc_auc"))
    finally:
        shutil.rmtree(d, ignore_errors=True)

    # --- if sklearn IS present, ROC figure is produced (but AUC comes from evaluator) ---
    if bp.HAS_SKLEARN:
        d = Path(tempfile.mkdtemp())
        p = d / "plots"
        p.mkdir()
        try:
            synthetic_results(d)
            write_run_info(d, "success")
            res = run_plotter(d, p)
            check("sklearn present -> exit 0", res.returncode == 0, f"rc={res.returncode}")
            check("sklearn present -> 4 figures", "Generated 4 figure(s)" in res.stdout, res.stdout[-160:])
            summary = {r["metric"]: r["value"] for r in csv.DictReader((d / "biometric_summary.csv").open())}
            # AUC should still be from evaluator (empty in synthetic), not overwritten by sklearn
            check("roc_auc not overwritten by sklearn", summary.get("roc_auc") == "", summary.get("roc_auc"))
        finally:
            shutil.rmtree(d, ignore_errors=True)
    else:
        print("  (sklearn absent - ROC/AUC path not exercised here)")

    print(f"\nPython: {passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()