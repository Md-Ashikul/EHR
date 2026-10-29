"""Generate report_v2/paper_numbers_audit_r5.md from results_v2/numbers_v2_r4.json.
Every value in the main table is read from the JSON; every row of the reference table is
recomputed from results/biometric_pairs.csv (and numbers_v2_r2.json for CV/EER items).
Run from biometric_evaluation/:  python scripts_v2/audit_r5.py
Refuses to overwrite an existing audit file."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[1]
J = json.load(open(ROOT / "results_v2" / "numbers_v2_r4.json"))["paper_derived"]
R2 = json.load(open(ROOT / "results_v2" / "numbers_v2_r2.json"))
OUT = ROOT / "report_v2" / "paper_numbers_audit_r5.md"
if OUT.exists():
    sys.exit(f"{OUT} already exists; not overwriting")

# key -> (paper statement, formula in words, section)
M = {
 "genuine_mean": ("Mean descriptor distance of same-person pairs", "mean of distance over evaluated genuine pairs", "B"),
 "genuine_sd": ("SD of descriptor distance, same-person pairs", "sample SD (ddof=1) over evaluated genuine pairs", "B"),
 "impostor_mean": ("Mean descriptor distance of different-person pairs", "mean of distance over evaluated impostor pairs", "B"),
 "impostor_sd": ("SD of descriptor distance, different-person pairs", "sample SD (ddof=1) over evaluated impostor pairs", "B"),
 "genuine_median": ("Median distance, same-person pairs", "median over evaluated genuine pairs", "not used in text"),
 "impostor_median": ("Median distance, different-person pairs", "median over evaluated impostor pairs", "not used in text"),
 "dprime": ("Separation between the two distance distributions (d')", "(impostor_mean - genuine_mean) / sqrt((genuine_var + impostor_var)/2), ddof=1", "B"),
 "genuine_below_threshold_fraction": ("Share of same-person pairs at or below 0.60", "fraction of evaluated genuine pairs with distance <= 0.60", "B"),
 "impostor_above_threshold_fraction": ("Share of different-person pairs above 0.60", "fraction of evaluated impostor pairs with distance > 0.60", "B"),
 "per_fold_accuracy_min": ("Lowest fold accuracy at 0.60", "minimum of the ten per-fold accuracies at threshold 0.60", "B"),
 "per_fold_accuracy_max": ("Highest fold accuracy at 0.60", "maximum of the ten per-fold accuracies at threshold 0.60", "B"),
 "per_fold_accuracy_mean": ("Mean fold accuracy at 0.60", "mean of the ten per-fold accuracies at threshold 0.60", "B"),
 "per_fold_accuracy_sd": ("SD of fold accuracy at 0.60 (percentage points)", "sample SD (ddof=1) of the ten per-fold accuracies, times 100", "B"),
 "per_fold_accuracy_min_fold": ("Fold with the lowest accuracy", "argmin of the per-fold accuracies", "not used in text"),
 "per_fold_accuracy_max_fold": ("Fold with the highest accuracy", "argmax of the per-fold accuracies", "not used in text"),
 "argmax_threshold": ("Threshold with the highest accuracy", "argmax of accuracy over the grid 0.00 to 1.20, step 0.01", "C"),
 "argmax_accuracy": ("Peak accuracy", "maximum of accuracy over the same grid", "C"),
 "min_accuracy_058_064": ("Lowest accuracy between thresholds 0.58 and 0.64", "minimum of accuracy over grid points 0.58 to 0.64", "C"),
 "peak_minus_fixed_pp": ("Gap between peak accuracy and accuracy at 0.60 (points)", "(max accuracy - accuracy at 0.60) * 100", "C"),
 "delta_frr_058_060_pp": ("FRR reduction from 0.58 to 0.60 (points)", "abs(FRR(0.58) - FRR(0.60)) * 100", "C"),
 "delta_far_058_060_pp": ("FAR increase from 0.58 to 0.60 (points)", "abs(FAR(0.60) - FAR(0.58)) * 100", "C"),
 "ratio_058_060": ("FRR points gained per FAR point, 0.58 to 0.60", "delta_frr_058_060 / delta_far_058_060", "C"),
 "delta_frr_060_062_pp": ("FRR reduction from 0.60 to 0.62 (points)", "abs(FRR(0.60) - FRR(0.62)) * 100", "C"),
 "delta_far_060_062_pp": ("FAR increase from 0.60 to 0.62 (points)", "abs(FAR(0.62) - FAR(0.60)) * 100", "C"),
 "ratio_060_062": ("FRR points gained per FAR point, 0.60 to 0.62", "delta_frr_060_062 / delta_far_060_062", "C"),
 "one_in_far_at_060": ("One impostor accepted per N attempts at 0.60", "1 / FAR at 0.60", "C"),
 "one_in_frr_at_060": ("One genuine user rejected per N attempts at 0.60", "1 / FRR at 0.60", "C"),
 "one_in_frr_security_rule": ("One genuine user rejected per N attempts, security rule", "1 / pooled FRR of the min-FAR (FRR <= 10%) rule", "D"),
 "cv_minus_fixed_mean_fold_accuracy_pp": ("Accuracy gain of CV-selected over fixed 0.60 (points)", "(CV mean fold accuracy - fixed mean fold accuracy) * 100", "D"),
 "far_ratio_cv_over_fixed": ("FAR of CV-selected thresholds relative to fixed 0.60", "pooled CV FAR / FAR at 0.60", "D, H"),
 "far_ratio_fixed_over_cv": ("FAR at 0.60 relative to CV-selected thresholds", "FAR at 0.60 / pooled CV FAR", "D, H"),
 "excluded_pair_fraction": ("Share of the 6,000 pairs excluded", "excluded_pairs / 6000", "E"),
 "genuine_exclusion_rate": ("Exclusion rate among same-person pairs", "excluded genuine pairs / 3000", "E"),
 "impostor_exclusion_rate": ("Exclusion rate among different-person pairs", "excluded impostor pairs / 3000", "E"),
 "tar_at_eer": ("True accept rate at the equal error rate", "1 - EER", "not used in text"),
}
def info(key):
    if key in M: return M[key]
    if key.endswith("_signed") and key[:-7] in M:
        s, f, _ = M[key[:-7]]
        return ("Signed version: " + s, "earlier-threshold value minus later-threshold value (" + f + ")", "not used in text")
    raise KeyError(f"no audit description for {key}")

keys = [k for k, v in J.items() if not k.endswith("_str") and not isinstance(v, (list, dict))]
rows = []
for k in keys:
    s, f, sec = info(k)
    rows.append((s, J[k + "_str"], "paper_derived." + k, f, sec))

# ---- independent recomputation from raw distances
bp = pd.read_csv(ROOT / "results" / "biometric_pairs.csv")
ev = bp[bp.evaluation_status == "evaluated"]
g = ev[ev.ground_truth == "genuine"].distance.to_numpy(); i = ev[ev.ground_truth == "impostor"].distance.to_numpy()
far = lambda t: (i <= t).mean(); frr = lambda t: (g > t).mean()
acc = lambda t: ((g <= t).sum() + (i > t).sum()) / (len(g) + len(i))
grid = np.round(np.arange(0, 1.2001, 0.01), 2); ac = np.array([acc(t) for t in grid])
ev = ev.assign(y=ev.ground_truth == "genuine"); ev = ev.assign(p=ev.distance <= 0.60)
pf = ev.groupby("fold_id").apply(lambda d: (d.p == d.y).mean())
gm, im = g.mean(), i.mean(); gv, iv = g.var(ddof=1), i.var(ddof=1)
ne = bp[bp.evaluation_status != "evaluated"]
ref = [  # label, computed, reference, tolerance (half of the last reference digit)
 ("genuine mean", gm, 0.4495, 5e-4), ("genuine SD", np.sqrt(gv), 0.0906, 5e-4),
 ("impostor mean", im, 0.8203, 5e-4), ("impostor SD", np.sqrt(iv), 0.0873, 5e-4),
 ("d-prime", (im - gm) / np.sqrt((gv + iv) / 2), 4.170, 5e-3),
 ("genuine below 0.60", (g <= .6).mean(), 0.9593, 5e-5), ("impostor above 0.60", (i > .6).mean(), 0.9953, 5e-5),
 ("fold accuracy min", pf.min(), 0.9602, 5e-5), ("fold accuracy max", pf.max(), 0.9922, 5e-5),
 ("fold accuracy mean", pf.mean(), 0.9771, 5e-5), ("fold accuracy SD", pf.std(ddof=1), 0.0093, 5e-5),
 ("peak accuracy", ac.max(), 0.9800, 5e-5), ("peak threshold", grid[ac.argmax()], 0.62, 5e-3),
 ("min accuracy 0.58-0.64", ac[(grid >= .58) & (grid <= .64)].min(), 0.9685, 5e-5),
 ("peak minus fixed (pp)", (ac.max() - acc(.6)) * 100, 0.29, 5e-3),
 ("0.58-0.60 delta FRR (pp)", abs(frr(.58) - frr(.60)) * 100, 1.90, 5e-3), ("0.58-0.60 delta FAR (pp)", abs(far(.60) - far(.58)) * 100, 0.20, 5e-3),
 ("0.58-0.60 ratio", abs(frr(.58) - frr(.60)) / abs(far(.60) - far(.58)), 9.6, 5e-2),
 ("0.60-0.62 delta FRR (pp)", abs(frr(.60) - frr(.62)) * 100, 1.01, 5e-3), ("0.60-0.62 delta FAR (pp)", abs(far(.62) - far(.60)) * 100, 0.44, 5e-3),
 ("0.60-0.62 ratio", abs(frr(.60) - frr(.62)) / abs(far(.62) - far(.60)), 2.3, 5e-2),
 ("one in N impostor accepted", 1 / far(.6), 211, 0.5), ("one in N genuine rejected", 1 / frr(.6), 25, 0.5),
 ("security rule one in N", 1 / R2["cv_security"]["pooled"]["frr"], 12, 0.5),
 ("CV minus fixed (pp)", (R2["cv_accuracy"]["mean_fold_accuracy"] - R2["cv_fixed060"]["mean_fold_accuracy"]) * 100, 0.21, 5e-3),
 ("FAR ratio CV/fixed", R2["cv_accuracy"]["pooled"]["far"] / far(.6), 2.25, 5e-3),
 ("FAR ratio fixed/CV", far(.6) / R2["cv_accuracy"]["pooled"]["far"], 0.44, 5e-3),
 ("excluded pair fraction", len(ne) / 6000, 0.1492, 5e-5),
 ("genuine exclusion rate", (ne.ground_truth == "genuine").sum() / 3000, 0.1407, 5e-5),
 ("impostor exclusion rate", (ne.ground_truth == "impostor").sum() / 3000, 0.1577, 5e-5),
 ("TAR at EER", 1 - R2["eer"]["value"], 0.9761, 5e-5)]

L = ["# Paper Numbers Audit (r5)", "",
     "Generated by scripts_v2/audit_r5.py from results_v2/numbers_v2_r4.json. Values in the main table are the strings used in the paper; the reference table is recomputed from results/biometric_pairs.csv.", "",
     "## Paper-facing values", "",
     "| Paper statement | Value in paper | JSON key | Formula | Section |", "|---|---|---|---|---|"]
L += [f"| {a} | {b} | {c} | {d} | {e} |" for a, b, c, d, e in rows]
L += ["", "## Check against reference values", "",
      "Tolerance for each item is half a unit of the last digit of the reference value.", "",
      "| Item | Computed | Reference | Status |", "|---|---|---|---|"]
bad = 0
for lab, c, r, tol in ref:
    ok = abs(c - r) <= tol; bad += (not ok)
    L.append(f"| {lab} | {c:.6g} | {r} | {'OK' if ok else 'MISMATCH'} |")
L += ["", f"Result: {len(ref) - bad} of {len(ref)} items OK." + ("" if not bad else f" {bad} MISMATCH; see rows above.")]
OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
print(f"wrote {OUT}: {len(rows)} paper rows, {len(ref)} reference rows, {bad} mismatches")
