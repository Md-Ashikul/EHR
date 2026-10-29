import json
from pathlib import Path
import numpy as np
import pandas as pd

EVAL=Path(__file__).resolve().parents[1]
RES=EVAL/'results'
OUT=EVAL/'results_v2'
bp=pd.read_csv(RES/'biometric_pairs.csv')
ev=bp[bp['evaluation_status']=='evaluated'].copy()
ev['is_same']=(ev['ground_truth']=='genuine').astype(int)
ev['distance']=ev['distance'].astype(float)
ev['fold_id']=ev['fold_id'].astype(str)

n2=json.load(open(OUT/'numbers_v2_r2.json'))
out=dict(n2)  # copy everything

# a) distance distributions
gen=ev[ev['is_same']==1]['distance']; imp=ev[ev['is_same']==0]['distance']
g_mean=float(gen.mean()); g_sd=float(gen.std(ddof=1)); g_med=float(gen.median())
i_mean=float(imp.mean()); i_sd=float(imp.std(ddof=1)); i_med=float(imp.median())
# b) dprime
dprime=float((i_mean-g_mean)/np.sqrt((gen.var(ddof=1)+imp.var(ddof=1))/2))

# c) at 0.60
m06=n2['fixed_0_60']
g_below=float(m06['tpr']); imp_above=float(1-m06['far'])

# d) per-fold accuracy
per_fold={}
for f in sorted(ev['fold_id'].unique(), key=lambda x:int(x)):
    g=ev[ev['fold_id']==f]
    pred=(g['distance']<=0.60).astype(int)
    acc=float((pred==g['is_same']).mean())
    per_fold[str(f)]=acc
pf_vals=np.array(list(per_fold.values()))
pf_min=float(pf_vals.min()); pf_max=float(pf_vals.max())
pf_mean=float(pf_vals.mean()); pf_sd=float(pf_vals.std(ddof=1))
min_fold=str(min(per_fold,key=lambda k:per_fold[k]))
max_fold=str(max(per_fold,key=lambda k:per_fold[k]))

# e) accuracy plateau
GRID=np.round(np.arange(0.00,1.201,0.01),2)
accs=[]
for t in GRID:
    pred=(ev['distance']<=t).astype(int)
    accs.append(float((pred==ev['is_same']).mean()))
accs=np.array(accs)
argmax_idx=int(np.argmax(accs))
argmax_thr=float(GRID[argmax_idx]); argmax_acc=float(accs[argmax_idx])
mask=(GRID>=0.58)&(GRID<=0.64)
min_acc_plateau=float(accs[mask].min())
peak_minus_fixed_pp=float((argmax_acc-m06['accuracy'])*100)

# f) marginal tradeoff
def sweep_row(t):
    pred=(ev['distance']<=t).astype(int)
    tp=int(((pred==1)&(ev['is_same']==1)).sum()); tn=int(((pred==0)&(ev['is_same']==0)).sum())
    fp=int(((pred==1)&(ev['is_same']==0)).sum()); fn=int(((pred==0)&(ev['is_same']==1)).sum())
    n=tn+fp;p=tp+fn
    return (fn/p*100, fp/n*100)
frr58,far58=sweep_row(0.58); frr60,far60=sweep_row(0.60); frr62,far62=sweep_row(0.62)
delta_frr_58_60=frr58-frr60; delta_far_58_60=far58-far60
ratio_58_60=delta_frr_58_60/delta_far_58_60
delta_frr_60_62=frr60-frr62; delta_far_60_62=far60-far62
ratio_60_62=delta_frr_60_62/delta_far_60_62

# g) odds
one_in_far=1/m06['far']; one_in_frr=1/m06['frr']
one_in_frr_sec=1/n2['cv_security']['pooled']['frr']

# h) cv comparison
cv=n2['cv_accuracy']; fx=n2['cv_fixed060']
cv_minus_fixed_pp=(cv['mean_fold_accuracy']-fx['mean_fold_accuracy'])*100
far_ratio_cv_over_fixed=cv['pooled']['far']/m06['far']
far_ratio_fixed_over_cv=m06['far']/cv['pooled']['far']

# i) failure-to-acquire
excl_frac=n2['excluded_pairs']/6000
gen_excl_rate=n2['excluded_genuine']/3000
imp_excl_rate=n2['excluded_impostor']/3000

# j) tar at eer
tar_at_eer=1-n2['eer']['value']

paper_derived={
 'genuine_mean':g_mean,'genuine_mean_str':f'{g_mean:.3f}',
 'genuine_sd':g_sd,'genuine_sd_str':f'{g_sd:.3f}',
 'impostor_mean':i_mean,'impostor_mean_str':f'{i_mean:.3f}',
 'impostor_sd':i_sd,'impostor_sd_str':f'{i_sd:.3f}',
 'genuine_median':g_med,'genuine_median_str':f'{g_med:.3f}',
 'impostor_median':i_med,'impostor_median_str':f'{i_med:.3f}',
 'dprime':dprime,'dprime_str':f'{dprime:.2f}',
 'genuine_below_threshold_fraction':g_below,'genuine_below_threshold_fraction_str':f'{g_below*100:.1f}%',
 'impostor_above_threshold_fraction':imp_above,'impostor_above_threshold_fraction_str':f'{imp_above*100:.1f}%',
 'per_fold_accuracy_fixed_060':per_fold,
 'per_fold_accuracy_min':pf_min,'per_fold_accuracy_min_str':f'{pf_min*100:.1f}%',
 'per_fold_accuracy_max':pf_max,'per_fold_accuracy_max_str':f'{pf_max*100:.1f}%',
 'per_fold_accuracy_mean':pf_mean,
 'per_fold_accuracy_sd':pf_sd,
 'per_fold_accuracy_min_fold':min_fold,
 'per_fold_accuracy_max_fold':max_fold,
 'accuracy_at_all_thresholds': [float(x) for x in accs],
 'argmax_threshold':argmax_thr,'argmax_accuracy':argmax_acc,
 'min_accuracy_058_064':min_acc_plateau,
 'peak_minus_fixed_pp':peak_minus_fixed_pp,'peak_minus_fixed_pp_str':f'{peak_minus_fixed_pp:.2f}',
 'delta_frr_058_060_pp':delta_frr_58_60,'delta_frr_058_060_str':f'{delta_frr_58_60:.2f}',
 'delta_far_058_060_pp':delta_far_58_60,'delta_far_058_060_str':f'{delta_far_58_60:.2f}',
 'ratio_058_060':ratio_58_60,'ratio_058_060_str':f'{ratio_58_60:.1f}',
 'delta_frr_060_062_pp':delta_frr_60_62,'delta_frr_060_062_str':f'{delta_frr_60_62:.2f}',
 'delta_far_060_062_pp':delta_far_60_62,'delta_far_060_062_str':f'{delta_far_60_62:.2f}',
 'ratio_060_062':ratio_60_62,'ratio_060_062_str':f'{ratio_60_62:.1f}',
 'one_in_far_at_060':one_in_far,'one_in_far_at_060_str':f'{round(one_in_far)}',
 'one_in_frr_at_060':one_in_frr,'one_in_frr_at_060_str':f'{round(one_in_frr)}',
 'one_in_frr_security_rule':one_in_frr_sec,'one_in_frr_security_rule_str':f'{round(one_in_frr_sec)}',
 'cv_minus_fixed_mean_fold_accuracy_pp':cv_minus_fixed_pp,'cv_minus_fixed_mean_fold_accuracy_pp_str':f'{cv_minus_fixed_pp:.2f}',
 'far_ratio_cv_over_fixed':far_ratio_cv_over_fixed,'far_ratio_cv_over_fixed_str':f'{far_ratio_cv_over_fixed:.2f}',
 'far_ratio_fixed_over_cv':far_ratio_fixed_over_cv,'far_ratio_fixed_over_cv_str':f'{far_ratio_fixed_over_cv:.2f}',
 'excluded_pair_fraction':excl_frac,'excluded_pair_fraction_str':f'{excl_frac*100:.1f}%',
 'genuine_exclusion_rate':gen_excl_rate,'genuine_exclusion_rate_str':f'{gen_excl_rate*100:.2f}%',
 'impostor_exclusion_rate':imp_excl_rate,'impostor_exclusion_rate_str':f'{imp_excl_rate*100:.2f}%',
 'tar_at_eer':tar_at_eer,'tar_at_eer_str':f'{tar_at_eer*100:.1f}%',
}

out['paper_derived']=paper_derived
with open(OUT/'numbers_v2_r3.json','w') as f:
    json.dump(out,f,indent=2)
print('done')
