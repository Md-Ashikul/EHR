import json, numpy as np, pandas as pd
from pathlib import Path
EVAL=Path(__file__).resolve().parents[1]
def loadr4(): return json.load(open(EVAL/'results_v2'/'numbers_v2_r4.json'))
def loadr2(): return json.load(open(EVAL/'results_v2'/'numbers_v2_r2.json'))
def evdf():
    bp=pd.read_csv(EVAL/'results'/'biometric_pairs.csv')
    ev=bp[bp['evaluation_status']=='evaluated'].copy()
    ev['is_same']=(ev['ground_truth']=='genuine').astype(int)
    ev['distance']=ev['distance'].astype(float)
    return ev
def test_distance_statistics():
    ev=evdf(); n=loadr4(); D=n['paper_derived']
    g=ev[ev['is_same']==1]['distance']; i=ev[ev['is_same']==0]['distance']
    assert abs(g.mean()-D['genuine_mean'])<1e-9
    assert abs(g.std(ddof=1)-D['genuine_sd'])<1e-9
    assert abs(i.mean()-D['impostor_mean'])<1e-9
    assert abs(i.std(ddof=1)-D['impostor_sd'])<1e-9
    assert abs(g.median()-D['genuine_median'])<1e-9
    assert abs(i.median()-D['impostor_median'])<1e-9
def test_threshold_fractions():
    ev=evdf(); n=loadr4(); D=n['paper_derived']
    assert abs(((ev[ev['is_same']==1]['distance']<=0.60).mean())-D['genuine_below_threshold_fraction'])<1e-9
    assert abs((1-(ev[ev['is_same']==0]['distance']<=0.60).mean())-D['impostor_above_threshold_fraction'])<1e-9
def test_per_fold_accuracy():
    ev=evdf(); n=loadr4(); D=n['paper_derived']
    pf=D['per_fold_accuracy_fixed_060']
    assert list(pf.keys())==[str(i) for i in range(1,11)]
    vals=np.array(list(pf.values()))
    assert abs(vals.min()-D['per_fold_accuracy_min'])<1e-9
    assert abs(vals.max()-D['per_fold_accuracy_max'])<1e-9
    assert abs(vals.mean()-D['per_fold_accuracy_mean'])<1e-9
    assert abs(vals.std(ddof=1)-D['per_fold_accuracy_sd'])<1e-9
def test_accuracy_plateau():
    ev=evdf(); n=loadr4(); D=n['paper_derived']
    GRID=np.round(np.arange(0,1.201,0.01),2)
    accs=np.array([float(((ev['distance']<=t).astype(int)==ev['is_same']).mean()) for t in GRID])
    assert abs(accs.max()-D['argmax_accuracy'])<1e-9
    assert abs(GRID[np.argmax(accs)]-D['argmax_threshold'])<1e-9
    mask=(GRID>=0.58)&(GRID<=0.64)
    assert abs(accs[mask].min()-D['min_accuracy_058_064'])<1e-9
    fixed=float(((ev['distance']<=0.60).astype(int)==ev['is_same']).mean())
    assert abs((accs.max()-fixed)*100-D['peak_minus_fixed_pp'])<1e-9
def test_tradeoff_absolute_values():
    ev=evdf(); n=loadr4(); D=n['paper_derived']
    def sw(t):
        pred=(ev['distance']<=t).astype(int)
        tp=int(((pred==1)&(ev['is_same']==1)).sum()); tn=int(((pred==0)&(ev['is_same']==0)).sum())
        fp=int(((pred==1)&(ev['is_same']==0)).sum()); fn=int(((pred==0)&(ev['is_same']==1)).sum())
        return fn/(tp+fn)*100, fp/(tn+fp)*100
    f58,far58=sw(0.58); f60,far60=sw(0.60); f62,far62=sw(0.62)
    assert abs(abs(f58-f60)-D['delta_frr_058_060_pp'])<1e-9
    assert abs(abs(far60-far58)-D['delta_far_058_060_pp'])<1e-9
    assert D['delta_frr_058_060_pp']>0 and D['delta_far_058_060_pp']>0
def test_tradeoff_signed_values():
    n=loadr4(); D=n['paper_derived']
    assert D['delta_far_058_060_pp_signed']<0
    assert D['delta_far_060_062_pp_signed']<0
def test_odds():
    n=loadr4(); D=n['paper_derived']; n2=loadr2()
    m06=n2['fixed_0_60']
    assert abs(1/m06['far']-D['one_in_far_at_060'])<1e-9
    assert abs(1/m06['frr']-D['one_in_frr_at_060'])<1e-9
    assert abs(1/n2['cv_security']['pooled']['frr']-D['one_in_frr_security_rule'])<1e-9
def test_cv_comparison():
    n=loadr4(); D=n['paper_derived']; n2=loadr2()
    cv=n2['cv_accuracy']; fx=n2['cv_fixed060']
    assert abs((cv['mean_fold_accuracy']-fx['mean_fold_accuracy'])*100-D['cv_minus_fixed_mean_fold_accuracy_pp'])<1e-9
    assert abs(cv['pooled']['far']/n2['fixed_0_60']['far']-D['far_ratio_cv_over_fixed'])<1e-9
    assert abs(n2['fixed_0_60']['far']/cv['pooled']['far']-D['far_ratio_fixed_over_cv'])<1e-9
def test_exclusion_rates():
    bp=pd.read_csv(EVAL/'results'/'biometric_pairs.csv')
    n=loadr4(); D=n['paper_derived']
    ex=bp[bp['evaluation_status']!='evaluated']
    assert abs(len(ex)/6000-D['excluded_pair_fraction'])<1e-9
    assert abs((ex['ground_truth']=='genuine').sum()/3000-D['genuine_exclusion_rate'])<1e-9
    assert abs((ex['ground_truth']=='impostor').sum()/3000-D['impostor_exclusion_rate'])<1e-9
def test_tar_at_eer():
    n=loadr4(); D=n['paper_derived']; n2=loadr2()
    assert abs(1-n2['eer']['value']-D['tar_at_eer'])<1e-9
def test_str_formatting():
    n=loadr4(); D=n['paper_derived']
    for k,v in list(D.items()):
        if k.endswith('_str') or isinstance(v,(list,dict)): continue
        assert k+'_str' in D
def test_r2_values_unchanged():
    n4=loadr4(); n2=loadr2()
    for k in n2:
        if k=='paper_derived': continue
        assert n4[k]==n2[k]
def test_audit_file():
    txt=(EVAL/'report_v2'/'paper_numbers_audit_r4.md').read_text()
    assert not txt.rstrip().endswith('"')
    readme=(EVAL/'scripts_v2'/'README_r4.md').read_text()
    assert not readme.rstrip().endswith('"')
if __name__=='__main__':
    print('ok')
