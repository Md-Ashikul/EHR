import json, numpy as np, pandas as pd
from pathlib import Path
EVAL=Path(__file__).resolve().parents[1]
def test_r3():
    n=json.load(open(EVAL/'results_v2'/'numbers_v2_r3.json'))
    n2=json.load(open(EVAL/'results_v2'/'numbers_v2_r2.json'))
    # contains all keys of r2
    for k in n2: assert k in n
    assert n['paper_derived'] is not None
    # per-fold keys
    pf=n['paper_derived']['per_fold_accuracy_fixed_060']
    assert list(pf.keys())==[str(i) for i in range(1,11)]
    # no trailing quote
    txt=(EVAL/'report_v2'/'paper_numbers_audit_r3.md').read_text()
    assert not txt.rstrip().endswith('"')
    print('PASS')
if __name__=='__main__':
    test_r3()
