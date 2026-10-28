import csv, os, json
from PIL import Image
from collections import Counter, defaultdict

ROOT='C:/EHR'
EVAL='C:/EHR/biometric_evaluation'
FAIL_CSV=EVAL+'/results/image_processing_failures.csv'
OUT=EVAL+'/failure_analysis'
os.makedirs(OUT+'/experiments',exist_ok=True)

rows=list(csv.DictReader(open(FAIL_CSV)))
meta=[]
for r in rows:
    rel=r['image_path']
    full=os.path.join(ROOT,rel.replace('/','\\'))
    info={'path':rel,'failure_reason':r['failure_reason']}
    try:
        im=Image.open(full)
        info['exists']=True
        info['format']=im.format
        info['mode']=im.mode
        info['width']=im.width
        info['height']=im.height
        info['readable']=True
    except Exception as e:
        info['exists']=os.path.exists(full)
        info['readable']=False
        info['error']=str(e)
    fn=os.path.basename(rel)
    info['identity']=fn.rsplit('_',1)[0]
    meta.append(info)

with open(OUT+'/failed_images_metadata.json','w') as f:
    json.dump(meta,f,indent=2)

print('total',len(meta))
print('formats',Counter(m.get('format') for m in meta))
print('modes',Counter(m.get('mode') for m in meta))
dims=Counter((m.get('width'),m.get('height')) for m in meta)
print('top dims',dims.most_common(10))
idc=Counter(m['identity'] for m in meta)
print('distinct identities',len(idc))
print('top identities',idc.most_common(10))
pairs=list(csv.DictReader(open(EVAL+'/pairs.csv')))
img_per_id=defaultdict(set)
for r in pairs:
    img_per_id[r['image_a'].rsplit('_',1)[0]].add(r['image_a'])
    img_per_id[r['image_b'].rsplit('_',1)[0]].add(r['image_b'])
fully_failed=0
for ident,c in idc.items():
    total=len(img_per_id.get(ident,set()))
    if total>0 and c==total:
        fully_failed+=1
print('fully failed identities (all images failed):',fully_failed)

import csv as c
with open(OUT+'/failed_images_summary.csv','w',newline='') as f:
    w=c.DictWriter(f,fieldnames=['path','identity','format','mode','width','height','readable'])
    w.writeheader()
    for m in meta:
        w.writerow({k:m.get(k) for k in ['path','identity','format','mode','width','height','readable']})
print('done')
