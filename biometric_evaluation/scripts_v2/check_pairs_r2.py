import hashlib, os
from pathlib import Path
EVAL=Path(__file__).resolve().parents[1]
ref=EVAL/'reference'/'pairs.txt'
out=EVAL/'results_v2'/'pairs_check_r2.txt'
if not ref.exists():
    out.write_text('skipped: reference/pairs.txt not present\n')
    print('skipped')
    raise SystemExit
# parse
rows=[]
with open(ref) as f:
    first=f.readline().strip()
    # first line "10\t300"
    nfolds, nper = first.split()
    nfolds=int(nfolds); nper=int(nper)
    for fold in range(1,nfolds+1):
        # 300 same
        for _ in range(nper):
            parts=f.readline().split()
            name=parts[0]; i=int(parts[1]); j=int(parts[2])
            rows.append((fold,1,f'{name}_{i:04d}.jpg',f'{name}_{j:04d}.jpg'))
        for _ in range(nper):
            parts=f.readline().split()
            n1=parts[0]; i=int(parts[1]); n2=parts[2]; j=int(parts[3])
            rows.append((fold,0,f'{n1}_{i:04d}.jpg',f'{n2}_{j:04d}.jpg'))
# compare with pairs.csv
import pandas as pd
pdf=pd.read_csv(EVAL/'pairs.csv')
# build comparable
pdf_rows=list(zip(pdf['fold_id'], pdf['is_same'], pdf['image_a'], pdf['image_b']))
# identical in order
identical_order = (len(rows)==len(pdf_rows)) and all(a==b for a,b in zip(rows,pdf_rows))
# ignoring order: set of frozensets per row? compare as sets of tuples where image order may swap
set_ref=set((f,s,a,b) for f,s,a,b in rows)
set_pdf=set((f,s,a,b) for f,s,a,b in pdf_rows)
identical_ignore = (set_ref==set_pdf)
# also allow swapped a/b
set_ref2=set()
for f,s,a,b in rows:
    set_ref2.add((f,s,frozenset([a,b])))
set_pdf2=set((f,s,frozenset([a,b])) for f,s,a,b in pdf_rows)
identical_swap = (set_ref2==set_pdf2)
sha_ref=hashlib.sha256(ref.read_bytes()).hexdigest()
sha_pdf=hashlib.sha256((EVAL/'pairs.csv').read_bytes()).hexdigest()
msg=f'rows_ref={len(rows)} rows_csv={len(pdf_rows)} identical_order={identical_order} identical_ignore_order={identical_ignore} identical_swap={identical_swap} sha_ref={sha_ref} sha_csv={sha_pdf}\n'
out.write_text(msg)
print(msg)
