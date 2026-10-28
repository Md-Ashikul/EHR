import os
import subprocess, sys
from pathlib import Path
EVAL=Path(__file__).resolve().parents[1]
os.chdir(str(EVAL))
for s in ['scripts_v2/threshold_analysis_r2.py','scripts_v2/check_pairs_r2.py','scripts_v2/make_plots_r2.py']:
    subprocess.run([sys.executable,s],check=True)
print('done')
