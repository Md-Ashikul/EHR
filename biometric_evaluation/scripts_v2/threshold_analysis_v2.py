import json, hashlib, os, subprocess, sys
import numpy as np
import pandas as pd

EVAL='C:/EHR/biometric_evaluation'
RES=EVAL+'/results'
OUT=EVAL+'/results_v2'
os.makedirs(OUT,exist_ok=True)

pairs=pd.read_csv(EVAL+'/pairs.csv')
bp=pd.read_csv(RES+'/biometric_pairs.csv')
# evaluated only
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
    n=tn+fp; p=tp+fn
    acc=(tp+tn)/len(df) if len(df) else 0
    far=fp/n if n else 0
    frr=fn/p if p else 0
    tpr=tp/p if p else 0
    return dict(tp=tp,tn=tn,fp=fp,fn=fn,accuracy=acc,far=far,frr=frr,tpr=tpr)

def best_threshold(train_df, mode):
    best=None
    for t in GRID:
        m=metrics_at(train_df,t)
        key=None
        if mode=='acc':
            key=(m['accuracy'], -abs(t-0.60))
        elif mode=='sec':
            if m['frr']<=0.10:
                key=( -m['far'], -abs(t-0.60) )
            else:
                key=None
        if key is None: continue
        if best is None or key>best[0]:
            best=(key,t,m)
    return best[1],best[2]

folds=sorted(ev['fold_id'].unique())
# CV accuracy selection
rows=[]
for f in folds:
    test=ev[ev['fold_id']==f]
    train=ev[ev['fold_id']!=f]
    thr,mtr=best_threshold(train,'acc')
    mt=metrics_at(test,thr)
    rows.append({'fold_id':f,'selected_threshold':thr,
        'train_accuracy':mtr['accuracy'],'test_accuracy':mt['accuracy'],
        'test_far':mt['far'],'test_frr':mt['frr'],'test_tpr':mt['tpr'],
        'test_n':len(test)})
cvacc=pd.DataFrame(rows)
cvacc.to_csv(OUT+'/cv_accuracy_selection.csv',index=False)

# security rule
srows=[]
for f in folds:
    test=ev[ev['fold_id']==f]
    train=ev[ev['fold_id']!=f]
    thr,mtr=best_threshold(train,'sec')
    mt=metrics_at(test,thr)
    srows.append({'fold_id':f,'selected_threshold':thr,
        'test_accuracy':mt['accuracy'],'test_far':mt['far'],'test_frr':mt['frr'],'test_n':len(test)})
cvsec=pd.DataFrame(srows)
cvsec.to_csv(OUT+'/cv_security_rule.csv',index=False)

# pooled
def pooled(cvdf):
    # recompute pooled from per-fold test using selected thresholds per fold
    tp=tn=fp=fn=0
    for _,r in cvdf.iterrows():
        test=ev[ev['fold_id']==r['fold_id']]
        thr=r['selected_threshold']
        m=metrics_at(test,thr)
        tp+=m['tp'];tn+=m['tn'];fp+=m['fp'];fn+=m['fn']
    n=tn+fp;p=tp+fn
    return dict(accuracy=(tp+tn)/(tp+tn+fp+fn),far=fp/n,frr=fn/p,tpr=tp/p,tp=tp,tn=tn,fp=fp,fn=fn)

pacc=pooled(cvacc); psec=pooled(cvsec)

# fixed 0.60 per fold
fixedrows=[]
for f in folds:
    test=ev[ev['fold_id']==f]
    mt=metrics_at(test,0.60)
    fixedrows.append({'fold_id':f,'threshold':0.60,'test_accuracy':mt['accuracy'],'test_far':mt['far'],'test_frr':mt['frr']})
fixeddf=pd.DataFrame(fixedrows)

# full-data sweep
full_metrics=metrics_at(ev,0.60)
# EER
best=None
for t in GRID:
    m=metrics_at(ev,t)
    d=abs(m['far']-m['frr'])
    if best is None or d<best[0]: best=(d,t,m)
eer_thr=best[1]; eer_val=best[2]['far']
# ROC AUC via sklearn
from sklearn.metrics import roc_auc_score, roc_curve
auc=roc_auc_score(ev['is_same'], -ev['distance'])

sweep_rows=[]
for t in [0.56,0.58,0.60,0.62,0.64,eer_thr]:
    m=metrics_at(ev,t)
    sweep_rows.append({'threshold':round(float(t),2),'accuracy':m['accuracy'],'far':m['far'],'frr':m['frr'],'tpr':m['tpr']})
sweep=pd.DataFrame(sweep_rows)
# add EER/AUC as extra? table includes eer threshold row already; add columns? Keep separate in numbers
sweep.to_csv(OUT+'/threshold_sweep_table.csv',index=False)

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
boot=dict(accuracy_ci=ci(accs),far_ci=ci(fars),frr_ci=ci(frrs),
          accuracy_mean=float(np.mean(accs)),far_mean=float(np.mean(fars)),frr_mean=float(np.mean(frrs)))

numbers=dict(
 evaluated_pairs=int(len(ev)),
 genuine_evaluated=int((ev['is_same']==1).sum()),
 impostor_evaluated=int((ev['is_same']==0).sum()),
 excluded_pairs=int(len(bp)-len(ev)),
 fixed_0_60=dict(accuracy=full_metrics['accuracy'],far=full_metrics['far'],frr=full_metrics['frr'],tpr=full_metrics['tpr']),
 roc_auc=float(auc), eer_threshold=float(eer_thr), eer=float(eer_val),
 cv_accuracy=dict(
   selected_thresholds=[float(x) for x in cvacc['selected_threshold'].tolist()],
   mean_threshold=float(cvacc['selected_threshold'].mean()),
   sd_threshold=float(cvacc['selected_threshold'].std(ddof=1)),
   mean_fold_accuracy=float(cvacc['test_accuracy'].mean()),
   sd_fold_accuracy=float(cvacc['test_accuracy'].std(ddof=1)),
   pooled=pacc),
 cv_fixed060=dict(mean_fold_accuracy=float(fixeddf['test_accuracy'].mean()),
   sd_fold_accuracy=float(fixeddf['test_accuracy'].std(ddof=1))),
 cv_security=dict(
   selected_thresholds=[float(x) for x in cvsec['selected_threshold'].tolist()],
   mean_threshold=float(cvsec['selected_threshold'].mean()),
   pooled=psec),
 bootstrap=boot,
)
with open(OUT+'/numbers_v2.json','w') as f: json.dump(numbers,f,indent=2)

# run_info
import platform
ri=dict(python=sys.version, numpy=numpy.__version__ if False else np.__version__,
        pandas=pd.__version__, seed=42)
try:
    ri['git_commit']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=EVAL).decode().strip()
except Exception as e:
    ri['git_commit']=str(e)
# sha256 inputs
inputs=['pairs.csv','results/biometric_pairs.csv','results/biometric_thresholds.csv','results/fold_results.csv','results/biometric_summary.csv','results/run_info.json']
sha={}
for p in inputs:
    full=os.path.join(EVAL,p)
    if os.path.exists(full):
        h=hashlib.sha256(open(full,'rb').read()).hexdigest()
        sha[p]=h
ri['input_sha256']=sha
with open(OUT+'/run_info_v2.json','w') as f: json.dump(ri,f,indent=2)
print('done')
print(json.dumps(numbers,indent=2)[:2000])
