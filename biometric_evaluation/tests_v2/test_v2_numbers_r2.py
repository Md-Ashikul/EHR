import json, pandas as pd, numpy as np
from pathlib import Path
EVAL=Path(__file__).resolve().parents[1]
def load(n): return json.load(open(EVAL/'results_v2'/n))
def test_pairs():
    p=pd.read_csv(EVAL/'pairs.csv'); assert len(p)==6000
    assert p['fold_id'].nunique()==10
    for f,g in p.groupby('fold_id'): assert len(g)==600
    for f,g in p.groupby('fold_id'):
        assert (g['is_same']==1).sum()==300 and (g['is_same']==0).sum()==300
def test_no_identity_overlap():
    p=pd.read_csv(EVAL/'pairs.csv')
    fold_ids={}
    for _,r in p.iterrows():
        for name in [r['image_a'],r['image_b']]:
            ident=name.rsplit('_',1)[0]
            fold_ids.setdefault(ident,set()).add(r['fold_id'])
    assert all(len(v)==1 for v in fold_ids.values())
def test_evaluated_excluded():
    bp=pd.read_csv(EVAL/'results'/'biometric_pairs.csv')
    ev=(bp['evaluation_status']=='evaluated').sum(); ex=(bp['evaluation_status']!='evaluated').sum()
    assert ev+ex==6000 and ev==5105 and ex==895
    assert (bp[bp['evaluation_status']=='evaluated']['ground_truth']=='genuine').sum()==2578
    assert (bp[bp['evaluation_status']=='evaluated']['ground_truth']=='impostor').sum()==2527
    assert (bp[bp['evaluation_status']!='evaluated']['ground_truth']=='genuine').sum()==422
    assert (bp[bp['evaluation_status']!='evaluated']['ground_truth']=='impostor').sum()==473
def test_fixed():
    bp=pd.read_csv(EVAL/'results'/'biometric_pairs.csv')
    ev=bp[bp['evaluation_status']=='evaluated'].copy()
    ev['is_same']=(ev['ground_truth']=='genuine').astype(int)
    thr=0.60
    pred=(ev['distance']<=thr).astype(int)
    tp=int(((pred==1)&(ev['is_same']==1)).sum()); tn=int(((pred==0)&(ev['is_same']==0)).sum())
    fp=int(((pred==1)&(ev['is_same']==0)).sum()); fn=int(((pred==0)&(ev['is_same']==1)).sum())
    acc=(tp+tn)/len(ev); far=fp/(tn+fp); frr=fn/(tp+fn)
    n=load('numbers_v2_r2.json')
    assert abs(acc-n['fixed_0_60']['accuracy'])<1e-6
    assert abs(far-n['fixed_0_60']['far'])<1e-6
    assert abs(frr-n['fixed_0_60']['frr'])<1e-6
def test_eer():
    bp=pd.read_csv(EVAL/'results'/'biometric_pairs.csv')
    ev=bp[bp['evaluation_status']=='evaluated'].copy()
    ev['is_same']=(ev['ground_truth']=='genuine').astype(int)
    GRID=np.round(np.arange(0,1.201,0.01),2)
    def m(t):
        pred=(ev['distance']<=t).astype(int)
        tp=int(((pred==1)&(ev['is_same']==1)).sum()); tn=int(((pred==0)&(ev['is_same']==0)).sum())
        fp=int(((pred==1)&(ev['is_same']==0)).sum()); fn=int(((pred==0)&(ev['is_same']==1)).sum())
        return fp/(tn+fp), fn/(tp+fn)
    ms=[(t,m(t)) for t in GRID]
    for i in range(1,len(ms)):
        f0,r0=ms[i-1]; f1,r1=ms[i]
        d0=r0[0]-r0[1]; d1=r1[0]-r1[1]
        if d0*d1<0:
            w0=abs(d1); w1=abs(d0); total=w0+w1
            thr=(f0*w0+f1*w1)/total; eer=(r0[0]*w0+r1[0]*w1)/total
            break
    n=load('numbers_v2_r2.json')
    assert abs(eer-n['eer']['value'])<1e-6
def test_cv():
    bp=pd.read_csv(EVAL/'results'/'biometric_pairs.csv')
    ev=bp[bp['evaluation_status']=='evaluated'].copy()
    ev['is_same']=(ev['ground_truth']=='genuine').astype(int)
    ev['fold_id']=ev['fold_id'].astype(str)
    GRID=np.round(np.arange(0,1.201,0.01),2)
    def metrics_at(df,thr):
        pred=(df['distance']<=thr).astype(int)
        tp=int(((pred==1)&(df['is_same']==1)).sum()); tn=int(((pred==0)&(df['is_same']==0)).sum())
        fp=int(((pred==1)&(df['is_same']==0)).sum()); fn=int(((pred==0)&(df['is_same']==1)).sum())
        n=tn+fp;p=tp+fn
        return (tp+tn)/len(df)
    def best(train):
        best=None
        for t in GRID:
            key=(metrics_at(train,t),-abs(t-0.60))
            if best is None or key>best[0]: best=(key,t)
        return best[1]
    folds=sorted(ev['fold_id'].unique())
    ths=[]
    for f in folds:
        train=ev[ev['fold_id']!=f]
        ths.append(best(train))
    n=load('numbers_v2_r2.json')
    assert [round(x,2) for x in ths]==[round(x,2) for x in n['cv_accuracy']['selected_thresholds']]
def test_json_bootstrap_contains_point():
    n=load('numbers_v2_r2.json')
    ci=n['bootstrap_fixed060']['accuracy_ci']
    assert ci[0]<=n['fixed_0_60']['accuracy']<=ci[1]
def test_no_trailing_quote():
    for fn in ['report_v2/evaluation_report_v2_r2.md','report_v2/paper_section_draft_r2.md']:
        txt=(EVAL/fn).read_text()
        assert not txt.rstrip().endswith('"')
