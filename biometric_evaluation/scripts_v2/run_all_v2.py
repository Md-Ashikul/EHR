import subprocess, sys, os
EVAL='C:/EHR/biometric_evaluation'
os.chdir(EVAL)
for s in ['scripts_v2/threshold_analysis_v2.py','scripts_v2/exclusion_analysis_v2.py','scripts_v2/make_plots_v2.py']:
    subprocess.run([sys.executable,s],check=True)
print('done')
