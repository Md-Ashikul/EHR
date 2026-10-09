"""Generate publication-ready figures from biometric evaluator CSV outputs."""
from pathlib import Path
import csv
import math
import numpy as np
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"
PLOTS = ROOT / "plots"
PLOTS.mkdir(exist_ok=True)

def read_csv(name):
    with (RESULTS / name).open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))

def f(row, key):
    try: return float(row[key])
    except (ValueError, TypeError, KeyError): return math.nan

def save(fig, name):
    fig.tight_layout(); fig.savefig(PLOTS / f"{name}.png", dpi=300, bbox_inches='tight'); fig.savefig(PLOTS / f"{name}.pdf", bbox_inches='tight'); plt.close(fig)

pairs = read_csv('biometric_pairs.csv')
valid = [r for r in pairs if r.get('evaluation_status') == 'evaluated' and math.isfinite(f(r,'distance'))]
thresholds = read_csv('biometric_thresholds.csv')
summary = {r['metric']: r['value'] for r in read_csv('biometric_summary.csv')}
base = float(summary.get('baseline_threshold', '0.60'))
selected = float(summary['validation_selected_threshold']) if summary.get('validation_selected_threshold') else None
eer_threshold = float(summary['eer_threshold']) if summary.get('eer_threshold') else None

if valid:
    genuine = np.array([f(r,'distance') for r in valid if r['ground_truth']=='genuine'])
    impostor = np.array([f(r,'distance') for r in valid if r['ground_truth']=='impostor'])
    fig, ax = plt.subplots(figsize=(8,5));
    bins = np.linspace(0, max(1.2, max(f(r,'distance') for r in valid)), 60)
    if len(genuine): ax.hist(genuine,bins,alpha=.65,label=f'Genuine (n={len(genuine)})',density=True)
    if len(impostor): ax.hist(impostor,bins,alpha=.65,label=f'Impostor (n={len(impostor)})',density=True)
    ax.axvline(base,color='black',ls='--',label=f'Baseline θ={base:.2f}')
    if selected is not None: ax.axvline(selected,color='tab:green',ls=':',label=f'Validation θ={selected:.2f}')
    ax.set(xlabel='Euclidean distance (lower = more similar)',ylabel='Density',title='Genuine versus impostor distance distributions'); ax.legend(); save(fig,'genuine_vs_impostor_distribution')

if thresholds:
    x=np.array([f(r,'threshold') for r in thresholds]); far=np.array([f(r,'far') for r in thresholds]); frr=np.array([f(r,'frr') for r in thresholds])
    fig,ax=plt.subplots(figsize=(8,5)); ax.plot(x,far,label='FAR'); ax.plot(x,frr,label='FRR'); ax.axvline(base,color='black',ls='--',label='Baseline 0.60')
    if eer_threshold is not None: ax.axvline(eer_threshold,color='tab:orange',ls=':',label=f'EER θ={eer_threshold:.2f}')
    if selected is not None: ax.axvline(selected,color='tab:green',ls='-.',label=f'Validation θ={selected:.2f}')
    ax.set(xlabel='Threshold θ',ylabel='Rate',title='FAR and FRR versus threshold'); ax.set_ylim(0,1); ax.legend(); save(fig,'far_frr_vs_threshold')
    fig,ax=plt.subplots(figsize=(6,6)); tar=np.array([f(r,'tar') for r in thresholds]); ax.plot(far,tar,label='ROC'); ax.plot([0,1],[0,1],color='gray',ls='--'); auc=np.trapz(tar[np.argsort(far)],far[np.argsort(far)]) if np.isfinite(tar).any() else math.nan; ax.set(xlabel='False acceptance rate (FAR)',ylabel='True acceptance rate (TAR)',title=f'ROC curve (AUC={auc:.4f})'); ax.legend(); save(fig,'roc_curve')
    selected_row=next((r for r in thresholds if selected is not None and abs(f(r,'threshold')-selected)<1e-9),None); base_row=next((r for r in thresholds if abs(f(r,'threshold')-base)<1e-9),None); labels=[]; vals={k:[] for k in ['far','frr','tar','tnr']}
    for label,row in [('Baseline 0.60',base_row),('Validation-selected',selected_row)]:
        if row: labels.append(label); [vals[k].append(f(row,k)) for k in vals]
    if labels:
        fig,ax=plt.subplots(figsize=(8,5)); pos=np.arange(len(labels)); width=.18
        for i,k in enumerate(vals): ax.bar(pos+(i-1.5)*width,vals[k],width,label=k.upper())
        ax.set_xticks(pos,labels); ax.set_ylim(0,1); ax.set_ylabel('Rate'); ax.set_title('Threshold comparison'); ax.legend(); save(fig,'threshold_comparison')
print(f'Generated plots from {len(valid)} evaluated pairs in {PLOTS}')
