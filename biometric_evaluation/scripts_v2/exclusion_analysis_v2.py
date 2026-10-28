import json, os, hashlib
import pandas as pd

EVAL='C:/EHR/biometric_evaluation'
RES=EVAL+'/results'
OUT=EVAL+'/results_v2'
os.makedirs(OUT,exist_ok=True)

pairs=pd.read_csv(EVAL+'/pairs.csv')
bp=pd.read_csv(RES+'/biometric_pairs.csv')
fail=pd.read_csv(RES+'/image_processing_failures.csv')

# distinct images in pairs.csv
imgs=set()
for _,r in pairs.iterrows():
    imgs.add(r['image_a']); imgs.add(r['image_b'])
# map filenames to failed (by basename)
failed_names=set(fail['image_path'].apply(lambda x: x.split('/')[-1]))
# resolve csv paths? failure log uses lfw_images/identity/file; basename matches image_a
failed_count=len(failed_names & imgs)
total_distinct=len(imgs)
# image level failure-to-acquire
print('distinct images',total_distinct,'failed',failed_count)

# pair level excluded = either image failed
def failed_fn(name): return name in failed_names
pairs['a_fail']=pairs['image_a'].apply(failed_fn)
pairs['b_fail']=pairs['image_b'].apply(failed_fn)
pairs['excluded']=pairs['a_fail']|pairs['b_fail']
pairs['one_fail']=(pairs['a_fail']^pairs['b_fail'])
pairs['both_fail']=pairs['a_fail']&pairs['b_fail']

# genuine/impostor
pairs['is_same']=pairs['is_same'].astype(int)
gen=pairs[pairs['is_same']==1]; imp=pairs[pairs['is_same']==0]
excl_gen=int(gen['excluded'].sum()); excl_imp=int(imp['excluded'].sum())
one_fail=int(pairs['one_fail'].sum()); both_fail=int(pairs['both_fail'].sum())

# identities with all images failed
img_per_id={}
for _,r in pairs.iterrows():
    img_per_id.setdefault(r['image_a'].rsplit('_',1)[0],set()).add(r['image_a'])
    img_per_id.setdefault(r['image_b'].rsplit('_',1)[0],set()).add(r['image_b'])
full_failed_ids=[i for i in img_per_id if img_per_id[i].issubset(failed_names)]
# count
n_full_failed=len(full_failed_ids)

# per fold
byfold=[]
for f,g in pairs.groupby('fold_id'):
    byfold.append({'fold_id':f,'total':len(g),'excluded':int(g['excluded'].sum()),
        'genuine_excluded':int(g[g['is_same']==1]['excluded'].sum()),
        'impostor_excluded':int(g[g['is_same']==0]['excluded'].sum())})
byfold_df=pd.DataFrame(byfold)
byfold_df.to_csv(OUT+'/exclusion_by_fold.csv',index=False)

# minConf recovery
import json
rec={}
for t in [0.1,0.2,0.3,0.4,0.5]:
    d=json.load(open(EVAL+'/failure_analysis/experiments/ssd_minConf_{}.json'.format(t)))
    rec[t]=d['summary']['detected']/d['summary']['total']
summary=pd.DataFrame([{'metric':'distinct_images_total','value':total_distinct},
 {'metric':'failed_images','value':failed_count},
 {'metric':'failure_to_acquire_rate','value':failed_count/total_distinct},
 {'metric':'excluded_pairs_total','value':int(pairs['excluded'].sum())},
 {'metric':'excluded_genuine','value':excl_gen},
 {'metric':'excluded_impostor','value':excl_imp},
 {'metric':'genuine_exclusion_rate','value':excl_gen/len(gen)},
 {'metric':'impostor_exclusion_rate','value':excl_imp/len(imp)},
 {'metric':'one_failed_image_pairs','value':one_fail},
 {'metric':'both_failed_image_pairs','value':both_fail},
 {'metric':'identities_all_images_failed','value':n_full_failed}])
summary.to_csv(OUT+'/exclusion_summary.csv',index=False)

# verify claim: fully-failed identities appear mostly in impostor pairs?
# count genuine pairs whose identity fully failed
fullset=set(full_failed_ids)
genuine_pairs_with_ff=gen[gen['image_a'].apply(lambda x: x.rsplit('_',1)[0] in fullset)].shape[0]
print('genuine pairs with fully-failed identity:',genuine_pairs_with_ff)
print('done')
