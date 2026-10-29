"""Paper figures for the biometric results section.
Run from biometric_evaluation/:  python make_paper_figures.py
Reads results/biometric_pairs.csv and results_v2/numbers_v2_r2.json; writes figures/*.png|pdf"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "figures"; OUT.mkdir(exist_ok=True)
bp = pd.read_csv(ROOT / "results" / "biometric_pairs.csv")
ev = bp[bp.evaluation_status == "evaluated"]
gen = ev[ev.ground_truth == "genuine"].distance.to_numpy()
imp = ev[ev.ground_truth == "impostor"].distance.to_numpy()
N = json.load(open(ROOT / "results_v2" / "numbers_v2_r2.json"))
T_FIX, T_CV, T_EER = 0.60, N["cv_accuracy"]["mean_threshold"], N["eer"]["threshold"]
plt.rcParams.update({"font.family": "serif", "font.size": 9, "axes.labelsize": 9,
                     "legend.fontsize": 8, "axes.grid": True, "grid.alpha": .25})
def save(fig, name):
    fig.savefig(OUT / f"{name}.png", dpi=300, bbox_inches="tight")
    fig.savefig(OUT / f"{name}.pdf", bbox_inches="tight"); plt.close(fig)

grid = np.round(np.arange(0, 1.2001, 0.005), 3)
far = np.array([(imp <= t).mean() for t in grid]); frr = np.array([(gen > t).mean() for t in grid])
acc = np.array([((gen <= t).sum() + (imp > t).sum()) / (len(gen) + len(imp)) for t in grid])

# Fig 1: score distributions
fig, ax = plt.subplots(figsize=(6.2, 3.0)); bins = np.linspace(0.1, 1.15, 52)
ax.hist(gen, bins=bins, density=True, histtype="stepfilled", color="0.75", edgecolor="0.2", lw=1, label="Genuine pairs (same person)")
ax.hist(imp, bins=bins, density=True, histtype="step", color="0.0", lw=1.5, ls="--", label="Impostor pairs (different people)")
ax.set_ylim(0, 6.6); ax.axvline(T_FIX, color="k", lw=1.6, ls=":"); ax.text(T_FIX - .01, 6.2, "threshold 0.60", fontsize=8, va="top", ha="right")
ax.set_xlabel("Euclidean distance between face descriptors"); ax.set_ylabel("Density"); ax.legend(loc="upper right")
save(fig, "fig1_distance_distributions")

# Fig 2: operating-point region
fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.6, 2.9)); m = (grid >= .50) & (grid <= .75)
a1.plot(grid[m], acc[m] * 100, "k-", lw=1.6)
for t, ls, lab in [(T_FIX, ":", "0.60 (fixed)"), (T_CV, "--", f"{T_CV:.2f} (CV mean)"), (T_EER, "-.", f"{T_EER:.3f} (EER)")]:
    a1.axvline(t, color="k", ls=ls, lw=1.2, label=lab)
a1.set_xlabel("Threshold"); a1.set_ylabel("Accuracy (%)"); a1.set_ylim(94, 99); a1.legend(loc="lower center", fontsize=7)
a1.set_title("(a) Accuracy", fontsize=9)
a2.plot(grid[m], far[m] * 100, "k-", lw=1.6, label="FAR"); a2.plot(grid[m], frr[m] * 100, "k--", lw=1.6, label="FRR")
for t, ls in [(T_FIX, ":"), (T_CV, "--"), (T_EER, "-.")]: a2.axvline(t, color="0.4", ls=ls, lw=1.0)
a2.set_ylim(0, 10)
a2.set_xlabel("Threshold"); a2.set_ylabel("Error rate (%)"); a2.legend(loc="center right"); a2.set_title("(b) FAR and FRR", fontsize=9)
fig.tight_layout(); save(fig, "fig2_threshold_region")

# Fig 3: ROC (log FAR axis)
th = np.unique(np.concatenate([gen, imp])); fa = np.array([(imp <= t).mean() for t in th]); tp = np.array([(gen <= t).mean() for t in th])
fig, ax = plt.subplots(figsize=(4.2, 3.2)); ax.plot(np.maximum(fa, 1e-4), tp, "k-", lw=1.6, label=f"ROC (AUC = {N['roc_auc']:.4f})")
f60, t60 = (imp <= T_FIX).mean(), (gen <= T_FIX).mean(); ax.plot(max(f60, 1e-4), t60, "ko", ms=6, label=f"0.60: FAR {f60*100:.2f}%, TPR {t60*100:.1f}%")
fe = N["eer"]["value"]; ax.plot(fe, 1 - fe, "k^", ms=6, label=f"EER {fe*100:.1f}% (thr. {T_EER:.3f})")
ax.set_xscale("log"); ax.set_xlim(1e-4, 1); ax.set_ylim(0.85, 1.005)
ax.set_xlabel("False accept rate (log scale)"); ax.set_ylabel("True accept rate"); ax.legend(loc="lower right")
save(fig, "fig3_roc_log")
print("figures written to", OUT)
