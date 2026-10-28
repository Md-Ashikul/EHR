import json, hashlib, os, subprocess, sys
from pathlib import Path
import numpy as np
import pandas as pd

EVAL=Path(__file__).resolve().parents[1]
RES=EVAL/'results'
OUT=EVAL/'results_v2'
OUT.mkdir(exist_ok=True)

pairs=pd.read_csv(EVAL/'pairs.csv')
bp=pd.read_csv(RES/'biometric_pairs.csv')
ev=bp[bp['evaluation_status']=='evaluated'].copy()
ev['is_same']=(ev['ground_truth']=='genuine').astype(int)
ev['distance']=ev['distance'].astype(float)
ev['fold_id']=ev['fold_id'].astype(str)

GRID=np.round(np.arange(0.00,1.201,0.01),2)
def metrics_at(df,thr):
    pred=(df['distance']<=thr).astype(int)
    tp=int(((pred==1)&(df['is_same']==1)).sum())
    tn=int(((pred==0)&(df['is_same']==0)).sum())
    fp=int(((pred==1)&(df['is_same']==0)).sum())
    fn=int(((pred==0)&(df['is_same']==1)).sum())
    n=tn+fp;p=tp+fn
    return dict(tp=tp,tn=tn,fp=fp,fn=fn,accuracy=(tp+tn)/len(df),far=fp/n,frr=fn/p,tpr=tp/p)

def best_threshold(train_df, mode):
    best=None
    for t in GRID:
        m=metrics_at(train_df,t)
        if mode=='acc':
            key=(m['accuracy'], -abs(t-0.60))
        else:
            if m['frr']<=0.10: key=(-m['far'], -abs(t-0.60))
            else: key=None
        if key is None: continue
        if best is None or key>best[0]: best=(key,t,m)
    return best[1],best[2]

folds=sorted(ev['fold_id'].unique())
# CV accuracy
cv_rows=[]
for f in folds:
    test=ev[ev['fold_id']==f]; train=ev[ev['fold_id']!=f]
    thr,mtr=best_threshold(train,'acc')
    mt=metrics_at(test,thr)
    cv_rows.append({'fold_id':f,'selected_threshold':float(thr),'test_accuracy':mt['accuracy'],'test_far':mt['far'],'test_frr':mt['frr']})
cv_df=pd.DataFrame(cv_rows)
# pooled
tp=tn=fp=fn=0
for _,r in cv_df.iterrows():
    test=ev[ev['fold_id']==r['fold_id']]; m=metrics_at(test,r['selected_threshold'])
    tp+=m['tp'];tn+=m['tn'];fp+=m['fp'];fn+=m['fn']
pacc=dict(accuracy=(tp+tn)/(tp+tn+fp+fn),far=fp/(tn+fp),frr=fn/(tp+fn),tpr=tp/(tp+fn))

# security rule
sec_rows=[]
for f in folds:
    test=ev[ev['fold_id']==f]; train=ev[ev['fold_id']!=f]
    thr,_=best_threshold(train,'sec')
    mt=metrics_at(test,thr)
    sec_rows.append({'fold_id':f,'selected_threshold':float(thr)})
sec_df=pd.DataFrame(sec_rows)
tp=tn=fp=fn=0
for _,r in sec_df.iterrows():
    test=ev[ev['fold_id']==r['fold_id']]; m=metrics_at(test,r['selected_threshold'])
    tp+=m['tp'];tn+=m['tn'];fp+=m['fp'];fn+=m['fn']
psec=dict(accuracy=(tp+tn)/(tp+tn+fp+fn),far=fp/(tn+fp),frr=fn/(tp+fn))

# fixed 0.60 per fold
fixed_accs=[metrics_at(ev[ev['fold_id']==f],0.60)['accuracy'] for f in folds]

# EER interpolation
ms=[(t,metrics_at(ev,t)) for t in GRID]
best=None
for i in range(1,len(ms)):
    t0,m0=ms[i-1]; t1,m1=ms[i]
    d0=m0['far']-m0['frr']; d1=m1['far']-m1['frr']
    if d0==0:
        eer=m0['far']; thr=t0; break
    if d0*d1<0:
        # linear interp
        w0=abs(d1); w1=abs(d0); total=w0+w1
        thr=(t0*w0+t1*w1)/total
        eer=(m0['far']*w0+m1['far']*w1)/total
        best=(thr,eer); break
if best is None:
    # fallback nearest
    idx=min(range(len(ms)), key=lambda i: abs(ms[i][1]['far']-ms[i][1]['frr']))
    thr,eer=ms[idx][0],ms[idx][1]['far']
else:
    thr,eer=best
# grid value past crossing
grid_past=min(ms,key=lambda x:(abs(x[1]['far']-x[1]['frr']) if x[0]>=thr else 1e9))
# simpler: first grid point with threshold>=thr
past=[(t,m) for t,m in ms if t>=thr][0]

# full metrics
m06=metrics_at(ev,0.60)
from sklearn.metrics import roc_auc_score
auc=float(roc_auc_score(ev['is_same'], -ev['distance']))

# sweep
sweep=[]
for t in [0.56,0.58,0.60,0.62,0.64,thr]:
    m=metrics_at(ev,t)
    sweep.append({'threshold':round(float(t),4),'accuracy':m['accuracy'],'far':m['far'],'frr':m['frr'],'tpr':m['tpr']})

# bootstrap stratified
rng=np.random.default_rng(42)
gen=ev[ev['is_same']==1].reset_index(drop=True)
imp=ev[ev['is_same']==0].reset_index(drop=True)
accs=[];fars=[];frrs=[]
for _ in range(2000):
    g=gen.sample(n=len(gen),replace=True,random_state=int(rng.integers(0,2**31)))
    i=imp.sample(n=len(imp),replace=True,random_state=int(rng.integers(0,2**31)))
    d=pd.concat([g,i],ignore_index=True)
    m=metrics_at(d,0.60)
    accs.append(m['accuracy']);fars.append(m['far']);frrs.append(m['frr'])
def ci(a): return (float(np.percentile(a,2.5)),float(np.percentile(a,97.5)))
boot_fixed=dict(accuracy_ci=ci(accs),far_ci=ci(fars),frr_ci=ci(frrs))

# bootstrap CV pooled: resample pairs, recompute CV pooled accuracy? Simplify: bootstrap the pooled CV accuracy by resampling evaluated pairs stratified and recomputing cv pooled? Use fixed selected thresholds per fold on resampled test? We'll bootstrap the CV pooled metrics using the already selected thresholds per fold applied to resampled test sets.
cv_boot_acc=[];cv_boot_far=[];cv_boot_frr=[]
for _ in range(2000):
    tp=tn=fp=fn=0
    for f in folds:
        test=ev[ev['fold_id']==f]
        tg=test[test['is_same']==1]; ti=test[test['is_same']==0]
        rg=tg.sample(n=len(tg),replace=True,random_state=int(rng.integers(0,2**31)))
        ri=ti.sample(n=len(ti),replace=True,random_state=int(rng.integers(0,2**31)))
        rt=pd.concat([rg,ri],ignore_index=True)
        m=metrics_at(rt,cv_df[cv_df['fold_id']==f]['selected_threshold'].iloc[0])
        tp+=m['tp'];tn+=m['tn'];fp+=m['fp'];fn+=m['fn']
    n=tn+fp;p=tp+fn
    cv_boot_acc.append((tp+tn)/(tp+tn+fp+fn)); cv_boot_far.append(fp/n); cv_boot_frr.append(fn/p)
boot_cv=dict(accuracy_ci=ci(cv_boot_acc),far_ci=ci(cv_boot_far),frr_ci=ci(cv_boot_frr))

# exclusion
fail=pd.read_csv(RES/'image_processing_failures.csv')
failed_names=set(fail['image_path'].apply(lambda x: x.split('/')[-1]))
imgs=set()
for _,r in pairs.iterrows():
    imgs.add(r['image_a']); imgs.add(r['image_b'])
pairs['a_fail']=pairs['image_a'].apply(lambda x: x in failed_names)
pairs['b_fail']=pairs['image_b'].apply(lambda x: x in failed_names)
pairs['excluded']=pairs['a_fail']|pairs['b_fail']
pairs['one_fail']=pairs['a_fail']^pairs['b_fail']
pairs['both_fail']=pairs['a_fail']&pairs['b_fail']
pairs['is_same']=pairs['is_same'].astype(int)
gen=pairs[pairs['is_same']==1]; imp=pairs[pairs['is_same']==0]
# fully failed identities
img_per_id={}
for _,r in pairs.iterrows():
    img_per_id.setdefault(r['image_a'].rsplit('_',1)[0],set()).add(r['image_a'])
    img_per_id.setdefault(r['image_b'].rsplit('_',1)[0],set()).add(r['image_b'])
full_failed=[i for i in img_per_id if img_per_id[i].issubset(failed_names)]
byfold=[]
for f,g in pairs.groupby('fold_id'):
    byfold.append({'fold_id':int(f),'total':int(len(g)),'excluded':int(g['excluded'].sum()),
        'genuine_excluded':int(g[g['is_same']==1]['excluded'].sum()),
        'impostor_excluded':int(g[g['is_same']==0]['excluded'].sum()),
        'one_failed':int(g['one_fail'].sum()),'both_failed':int(g['both_fail'].sum())})

# recovery from experiments
rec={}
for t in [0.1,0.2,0.3,0.4,0.5]:
    d=json.load(open(EVAL/'failure_analysis/experiments'/'ssd_minConf_{}.json'.format(t)))
    rec[str(t)]=d['summary']['detected']/d['summary']['total']

numbers=dict(
 evaluated_pairs=int(len(ev)),
 genuine_evaluated=int((ev['is_same']==1).sum()),
 impostor_evaluated=int((ev['is_same']==0).sum()),
 excluded_pairs=int(len(pairs)-len(ev)),
 excluded_genuine=int(gen['excluded'].sum()),
 excluded_impostor=int(imp['excluded'].sum()),
 excluded_one_failed=int(pairs['one_fail'].sum()),
 excluded_both_failed=int(pairs['both_fail'].sum()),
 failed_images=619, total_distinct_images=7701,
 failure_to_acquire_rate=619/7701,
 identities_all_failed=len(full_failed),
 fixed_0_60=dict(accuracy=m06['accuracy'],far=m06['far'],frr=m06['frr'],tpr=m06['tpr']),
 roc_auc=auc,
 eer=dict(value=float(eer),threshold=float(thr),grid_past=float(past[0]),grid_past_value=float(past[1]['far'])),
 sweep=sweep,
 cv_accuracy=dict(selected_thresholds=[float(x) for x in cv_df['selected_threshold'].tolist()],
   mean_threshold=float(cv_df['selected_threshold'].mean()),
   sd_threshold=float(cv_df['selected_threshold'].std(ddof=1)),
   mean_fold_accuracy=float(cv_df['test_accuracy'].mean()),
   sd_fold_accuracy=float(cv_df['test_accuracy'].std(ddof=1)),
   pooled=pacc, bootstrap_ci=boot_cv),
 cv_fixed060=dict(mean_fold_accuracy=float(np.mean(fixed_accs)),sd_fold_accuracy=float(np.std(fixed_accs,ddof=1))),
 cv_security=dict(selected_thresholds=[float(x) for x in sec_df['selected_threshold'].tolist()],
   mean_threshold=float(sec_df['selected_threshold'].mean()),
   pooled=psec),
 bootstrap_fixed060=boot_fixed,
 exclusion_by_fold=byfold,
 recovery=rec,
)
with open(OUT/'numbers_v2_r2.json','w') as f: json.dump(numbers,f,indent=2)
print('done')
