import json, pandas as pd, os
EVAL='C:/EHR/biometric_evaluation'
def load(n): return json.load(open(EVAL+'/results_v2/'+n))
def test_pairs_count():
    p=pd.read_csv(EVAL+'/pairs.csv'); assert len(p)==6000
def test_folds():
    p=pd.read_csv(EVAL+'/pairs.csv'); assert p['fold_id'].nunique()==10
    for f,g in p.groupby('fold_id'): assert len(g)==600
def test_evaluated_excluded():
    bp=pd.read_csv(EVAL+'/results/biometric_pairs.csv')
    ev=(bp['evaluation_status']=='evaluated').sum(); ex=(bp['evaluation_status']!='evaluated').sum()
    assert ev+ex==6000 and ev==5105 and ex==895
def test_reference():
    n=load('numbers_v2.json')
    assert n['evaluated_pairs']==5105
    assert n['excluded_pairs']==895
    assert abs(n['fixed_0_60']['accuracy']-0.9771)<0.001
    assert abs(n['roc_auc']-0.9934)<0.001
