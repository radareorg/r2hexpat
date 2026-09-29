#!/usr/bin/env python3
# Extract the upstream PatternLanguage (C++) test sources into tests/upstream/
# usage: extract_upstream.py  (reads third_party/parser_cpp/tests/include/test_patterns)
import os, re, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'third_party/parser_cpp/tests/include/test_patterns')
OUT = os.path.join(ROOT, 'tests/upstream')
reg = open(os.path.join(ROOT, 'third_party/parser_cpp/tests/source/tests.cpp')).read()
enabled = set(re.findall(r'^\s*TEST\((\w+)\)', reg, re.M))
cls_re = re.compile(r'class\s+TestPattern(\w+)\s*:\s*public\s+(\w+)')
raw_re = re.compile(r'R"(\w*)\((.*?)\)\1"', re.S)
count = 0
for path in sorted(glob.glob(SRC + '/*.hpp')):
    text = open(path).read()
    classes = list(cls_re.finditer(text))
    for k, m in enumerate(classes):
        name = m.group(1)
        end = classes[k + 1].start() if k + 1 < len(classes) else len(text)
        body = text[m.end():end]
        if name not in enabled:
            continue
        raws = raw_re.findall(body)
        if not raws:
            continue
        src = raws[-1][1] if 'getSourceCode' in body else raws[0][1]
        failing = 'Mode::Failing' in body or m.group(2) == 'TestPatternFailingSemantic'
        lines = src.split('\n')
        ind = min((len(l) - len(l.lstrip()) for l in lines if l.strip()), default=0)
        src = '\n'.join(l[ind:] for l in lines).strip() + '\n'
        fn = os.path.join(OUT, name + ('.fail' if failing else '') + '.hexpat')
        open(fn, 'w').write(src)
        count += 1
print(count, 'tests extracted to', OUT)
