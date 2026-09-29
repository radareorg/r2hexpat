#!/usr/bin/env python3
# imhexpat integration test suite
# usage: run_tests.py [--update]
# Each tests/*.hexpat is run through the r2js plugin on /bin/ls and
# compared against tests/*.hexpat.golden. --update regenerates goldens.
import subprocess, sys, os, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WS = os.path.dirname(os.path.dirname(ROOT))
os.chdir(WS)
UPDATE = '--update' in sys.argv
passed = failed = 0
for hexpat in sorted(glob.glob('imhexpat/src/tests/*.hexpat')):
    golden = hexpat + '.golden'
    name = os.path.basename(hexpat)[:-7]
    try:
        out = subprocess.run(
            ['r2', '-q', '-i', 'imhexpat/src/hexpat.r2.js', '-c', 'hexpat ' + hexpat, '/bin/ls'],
            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)
        got = out.stdout
    except Exception as e:
        print('ERROR:', name, str(e)); failed += 1; continue
    if UPDATE:
        open(golden, 'w').write(got)
        print('golden updated:', name)
        continue
    if not os.path.exists(golden):
        continue
    want = open(golden).read()
    if got.strip() == want.strip():
        print('PASS:', name); passed += 1
    else:
        print('FAIL:', name); failed += 1
        print('--- got:'); print(got)
        print('--- expected:'); print(want)
print('==================================')
print(str(passed) + ' passed, ' + str(failed) + ' failed')
sys.exit(1 if (failed and not UPDATE) else 0)
