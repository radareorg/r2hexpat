#!/usr/bin/env python3
# Upstream PatternLanguage conformance suite (tests/upstream/*.hexpat)
# Each test is evaluated by the r2js plugin against tests/upstream/test_data.bin.
# A test passes when it evaluates without error; *.fail.hexpat must error.
# usage: run_upstream.py [-v] [-u] [name ...]
#   -v  show output of failing tests
#   -u  rewrite tests/upstream/XFAIL with the currently failing tests
import subprocess, sys, os, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'tests/upstream')
PLUGIN = os.path.join(ROOT, 'hexpat.r2.js')
XFAIL = os.path.join(DIR, 'XFAIL')
args = [a for a in sys.argv[1:] if not a.startswith('-')]
verbose = '-v' in sys.argv
update = '-u' in sys.argv
xfail = set()
if os.path.exists(XFAIL):
    xfail = set(l.split('#')[0].strip() for l in open(XFAIL) if l.split('#')[0].strip())

def run(path):
    cmd = ['r2', '-q', '-e', 'bin.cache=false', '-i', PLUGIN, '-c', 'hexpat -q ' + os.path.basename(path), 'test_data.bin']
    try:
        p = subprocess.run(cmd, cwd=DIR, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
        out = p.stdout + p.stderr
    except subprocess.TimeoutExpired:
        return False, 'timeout'
    errored = 'hexpat: ' in out or p.returncode != 0
    return (errored if path.endswith('.fail.hexpat') else not errored), out

failing, regressions, fixed = [], [], []
tests = sorted(glob.glob(DIR + '/*.hexpat'))
for path in tests:
    name = os.path.basename(path)[:-len('.hexpat')]
    if args and name not in args and name.split('.')[0] not in args:
        continue
    ok, out = run(path)
    if ok:
        print('PASS', name)
        if name in xfail: fixed.append(name)
    else:
        failing.append(name)
        print('FAIL' if name not in xfail else 'XFAIL', name)
        if name not in xfail: regressions.append(name)
        if verbose: print('   ' + out.strip().replace('\n', '\n   '))
total = len(tests) if not args else len([t for t in tests if os.path.basename(t)[:-7] in args or os.path.basename(t).split('.')[0] in args])
print('==================================')
print('%d/%d passed' % (total - len(failing), total))
if update and not args:
    open(XFAIL, 'w').write('# upstream tests known to fail (regenerate with run_upstream.py -u)\n' + ''.join(n + '\n' for n in failing))
    print('XFAIL updated')
    sys.exit(0)
if fixed: print('now passing (remove from XFAIL):', ' '.join(fixed))
if regressions: print('unexpected failures:', ' '.join(regressions))
sys.exit(1 if regressions else 0)
