import json
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.metrics import roc_curve

EVAL=Path(__file__).resolve().parents[1]
RES=EVAL/'results'
OUTP=EVAL/'plots_v2'
OUTP.mkdir(exist_ok=True)
ev=pd.read_csv(RES/'biometric_pairs.csv')
ev=ev[ev['evaluation_status']=='evaluated'].copy()
ev['is_same']=(ev['ground_truth']=='genuine').astype(int)
ev['distance']=ev['distance'].astype(float)
nums=json.load(open(EVAL/'results_v2'/'numbers_v2_r2.json'))
GRID=np.round(np.arange(0,1.201,0.01),2)
def m(t):
    pred=(ev['distance']<=t).astype(int)
    tp=int(((pred==1)&(ev['is_same']==1)).sum()); tn=int(((pred==0)&(ev['is_same']==0)).sum())
    fp=int(((pred==1)&(ev['is_same']==0)).sum()); fn=int(((pred==0)&(ev['is_same']==1)).sum())
    n=tn+fp;p=tp+fn
    return tp,tn,fp,fn,(tp+tn)/len(ev),fp/n,fn/p,tp/p
accs=[m(t)[4] for t in GRID]; fars=[m(t)[5] for t in GRID]; frrs=[m(t)[6] for t in GRID]
eer_thr=nums['eer']['threshold']; cv_mean=nums['cv_accuracy']['mean_threshold']
def save(fig,name):
    fig.set_size_inches(3.5,2.6)
    fig.savefig(str(OUTP/(name+'.png')),dpi=300,bbox_inches='tight')
    fig.savefig(str(OUTP/(name+'.pdf')),bbox_inches='tight')
    plt.close(fig)
fig,ax=plt.subplots(); ax.plot(GRID,accs,'k-'); ax.axvline(0.60,color='k',linestyle='--'); ax.axvline(cv_mean,color='k',linestyle=':'); ax.axvline(eer_thr,color='k',linestyle='-.'); ax.set_xlabel('Threshold'); ax.set_ylabel('Accuracy'); save(fig,'accuracy_vs_threshold_r2')
fpr,tpr,_=roc_curve(ev['is_same'],-ev['distance'])
fig,ax=plt.subplots(); ax.plot(fpr,tpr,'k-',label='AUC=%.4f'%nums['roc_auc']); m06=m(0.60); ax.plot(m06[5],m06[7],'ko'); ax.plot(m(eer_thr)[5],m(eer_thr)[7],'k^'); ax.set_xlabel('FAR'); ax.set_ylabel('TPR'); ax.legend(fontsize=7); save(fig,'roc_curve_r2')
fig,ax=plt.subplots(); ax.hist(ev[ev['is_same']==1]['distance'],bins=40,density=True,histtype='step',linestyle='-',label='Genuine'); ax.hist(ev[ev['is_same']==0]['distance'],bins=40,density=True,histtype='step',linestyle='--',label='Impostor'); ax.axvline(0.60,color='k',linestyle=':'); ax.set_xlabel('Distance'); ax.set_ylabel('Density'); ax.legend(fontsize=7); save(fig,'distance_histograms_r2')
fig,ax=plt.subplots(); ax.plot(GRID,fars,'k-',label='FAR'); ax.plot(GRID,frrs,'k--',label='FRR'); ax.axvline(0.60,color='k',linestyle=':'); ax.axvline(eer_thr,color='k',linestyle='-.'); ax.set_xlabel('Threshold'); ax.set_ylabel('Rate'); ax.legend(fontsize=7); save(fig,'far_frr_vs_threshold_r2')
print('done')
