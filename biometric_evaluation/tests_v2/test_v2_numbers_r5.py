import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "report_v2" / "paper_numbers_audit_r5.md"

def _tables():
    tables, cur = [], []
    for line in AUDIT.read_text(encoding="utf-8").splitlines():
        if line.startswith("|"):
            cur.append([c.strip() for c in line.strip().strip("|").split("|")])
        elif cur:
            tables.append(cur); cur = []
    if cur: tables.append(cur)
    return [t[2:] for t in tables]  # drop header and separator rows

def test_no_empty_cells():
    for t in _tables():
        for row in t:
            assert all(c != "" for c in row), row

def test_main_table_is_informative():
    main = _tables()[0]
    for stmt, value, key, formula, section in main:
        assert stmt != key.split(".")[-1] and formula != "computed"
        assert section in {"B", "C", "D", "E", "H", "D, H", "not used in text"}, section

def test_row_count_matches_json():
    pdv = json.load(open(ROOT / "results_v2" / "numbers_v2_r4.json"))["paper_derived"]
    keys = [k for k, v in pdv.items() if not k.endswith("_str") and not isinstance(v, (list, dict))]
    assert len(_tables()[0]) == len(keys)

def test_values_match_json_strings():
    pdv = json.load(open(ROOT / "results_v2" / "numbers_v2_r4.json"))["paper_derived"]
    for stmt, value, key, formula, section in _tables()[0]:
        assert value == pdv[key.split(".")[-1] + "_str"]

def test_reference_table_all_ok():
    ref = _tables()[1]
    assert len(ref) >= 25 and all(r[-1] == "OK" for r in ref)

def test_no_trailing_quote():
    assert not AUDIT.read_text(encoding="utf-8").rstrip().endswith('"')
