import json, os
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

EVAL='C:/EHR/biometric_evaluation'
RES=EVAL+'/results'
OUTP=EVAL+'/plots_v2'
OUTT=EVAL+'/tables_v2'
os.makedirs(OUTP,exist_ok=True); os.makedirs(OUTT,exist_ok=True)

ev=pd.read_csv(RES+'/biometric_pairs.csv')
ev=ev[ev['evaluation_status']=='evaluated'].copy()
ev['is_same']=(ev['ground_truth']=='genuine').astype(int)
ev['distance']=ev['distance'].astype(float)

nums=json.load(open(EVAL+'/results_v2/numbers_v2.json'))
thr_grid=np.round(np.arange(0,1.201,0.01),2)
def m(t):
    pred=(ev['distance']<=t).astype(int)
    tp=int(((pred==1)&(ev['is_same']==1)).sum()); tn=int(((pred==0)&(ev['is_same']==0)).sum())
    fp=int(((pred==1)&(ev['is_same']==0)).sum()); fn=int(((pred==0)&(ev['is_same']==1)).sum())
    n=tn+fp;p=tp+fn
    return tp,tn,fp,fn,(tp+tn)/len(ev),fp/n,fn/p,tp/p
accs=[m(t)[4] for t in thr_grid]; fars=[m(t)[5] for t in thr_grid]; frrs=[m(t)[6] for t in thr_grid]
eer_thr=nums['eer_threshold']; cv_mean=nums['cv_accuracy']['mean_threshold']

def save(fig,name):
    fig.set_size_inches(3.5,2.6)
    fig.savefig(OUTP+'/'+name+'.png',dpi=300,bbox_inches='tight')
    fig.savefig(OUTP+'/'+name+'.pdf',bbox_inches='tight')
    plt.close(fig)

# 1 accuracy vs threshold
fig,ax=plt.subplots()
ax.plot(thr_grid,accs,'k-',label='Accuracy')
ax.axvline(0.60,color='k',linestyle='--',label='0.60')
ax.axvline(cv_mean,color='k',linestyle=':',label='CV mean')
ax.axvline(eer_thr,color='k',linestyle='-.',label='EER')
ax.set_xlabel('Threshold'); ax.set_ylabel('Accuracy'); ax.legend(fontsize=7)
save(fig,'accuracy_vs_threshold')

# 2 ROC
from sklearn.metrics import roc_curve, auc
fpr,tpr,_=roc_curve(ev['is_same'], -ev['distance'])
fig,ax=plt.subplots()
ax.plot(fpr,tpr,'k-',label=f'AUC={nums["roc_auc"]:.4f}')
# operating point at 0.60
m06=m(0.60); ax.plot(m06[5],m06[7],'ko',label='0.60')
ax.plot(m(eer_thr)[5],m(eer_thr)[7],'k^',label='EER')
ax.set_xlabel('FAR'); ax.set_ylabel('TPR'); ax.legend(fontsize=7)
save(fig,'roc_curve')

# 3 histograms
fig,ax=plt.subplots()
ax.hist(ev[ev['is_same']==1]['distance'],bins=40,density=True,histtype='step',linestyle='-',label='Genuine')
ax.hist(ev[ev['is_same']==0]['distance'],bins=40,density=True,histtype='step',linestyle='--',label='Impostor')
ax.axvline(0.60,color='k',linestyle=':')
ax.set_xlabel('Distance'); ax.set_ylabel('Density'); ax.legend(fontsize=7)
save(fig,'distance_histograms')

# 4 FAR/FRR
fig,ax=plt.subplots()
ax.plot(thr_grid,fars,'k-',label='FAR')
ax.plot(thr_grid,frrs,'k--',label='FRR')
ax.axvline(0.60,color='k',linestyle=':')
ax.axvline(eer_thr,color='k',linestyle='-.')
ax.set_xlabel('Threshold'); ax.set_ylabel('Rate'); ax.legend(fontsize=7)
save(fig,'far_frr_vs_threshold')
print('plots done')
