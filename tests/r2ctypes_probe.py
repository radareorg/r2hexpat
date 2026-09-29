#!/usr/bin/env python3
# Probe radare2's C type parser (libr/anal/c2) with plain C declarations and
# compare what r2 records against the C compiler (ground truth: offsetof and
# sizeof from `cc`). Reports parse failures and layout differences.
#
# usage: python3 tests/r2ctypes_probe.py [-v]
# Not part of `make test`: it documents r2 behaviour, it does not test r2hexpat.
import json, os, subprocess, sys, tempfile

VERBOSE = '-v' in sys.argv
ENV = dict(os.environ, R2_NOPLUGINS='1', R2_COLOR='0')

# (name, declarations, struct to inspect, members, note)
CASES = [
    ('natural alignment', 'struct t { uint8_t a; uint32_t b; uint64_t c; };', 't', 'a b c', ''),
    ('stdint alignment', 'struct t { uint8_t a; uint16_t b; uint8_t c; uint64_t d; };', 't', 'a b c d', ''),
    ('int alignment', 'struct t { char a; short b; char c; long long d; };', 't', 'a b c d', ''),
    ('pointers', 'struct t { uint8_t a; void *p; char *s; };', 't', 'a p s', ''),
    ('nested struct', 'struct in { uint8_t a; uint32_t b; }; struct t { uint8_t tag; struct in inner; uint16_t tail; };', 't', 'tag inner tail', ''),
    ('array of structs', 'struct el { uint64_t a; uint8_t b; }; struct t { struct el e[2]; uint8_t z; };', 't', 'e z', 'element stride needs tail padding'),
    ('union', 'union t { uint8_t b; uint64_t q; uint8_t bytes[12]; };', 't', 'b q bytes', ''),
    ('enum member', 'enum e { A = 1, B = 0x100 }; struct t { uint8_t x; enum e v; };', 't', 'x v', ''),
    ('typedef member', 'typedef uint32_t word; struct t { word w; word ws[2]; };', 't', 'w ws', ''),
    ('float/double', 'struct t { float f; double d; char c; };', 't', 'f d c', ''),
    ('bool', 'struct t { uint8_t a; bool ok; uint16_t n; };', 't', 'a ok n', ''),
    ('multiple declarators', 'struct t { uint8_t a, b, c; uint32_t d; };', 't', 'a b c d', ''),
    ('array size expression', 'struct t { uint8_t a[2 * 4]; uint8_t b; };', 't', 'a b', ''),
    ('array size with +', 'struct t { uint8_t a[4 + 4]; uint8_t b; };', 't', 'a b', ''),
    ('hex array size', 'struct t { uint8_t a[0x10]; uint8_t b; };', 't', 'a b', ''),
    ('bitfields', 'struct t { uint32_t lo : 3; uint32_t mid : 5; uint32_t hi : 24; uint8_t x; };', 't', 'x', 'bitfield members cannot use offsetof'),
    ('anonymous union member', 'struct t { uint8_t k; union { uint32_t i; float f; } u; uint8_t z; };', 't', 'k u z', ''),
    ('packed attribute after brace', 'struct t { uint8_t a; uint32_t b; } __attribute__((packed));', 't', 'a b', ''),
    ('packed attribute before name', 'struct __attribute__((packed)) t { uint8_t a; uint32_t b; };', 't', 'a b', ''),
    ('r2 @packed comment attribute', '/// @packed\nstruct t { uint8_t a; uint32_t b; };', 't', 'a b', 'r2 extension; C truth taken from the packed attribute',
     'struct t { uint8_t a; uint32_t b; } __attribute__((packed));'),
]


def cc_layout(decl, name, members, cdecl=None):
    """offsetof/sizeof per member from the system C compiler."""
    src = ['#include <stdio.h>', '#include <stdint.h>', '#include <stdbool.h>', '#include <stddef.h>', cdecl or decl, 'int main(void) {']
    kind = 'union' if decl.lstrip().startswith('union') or ('union t ' in decl and 'struct t' not in decl) else 'struct'
    tag = kind + ' ' + name
    src.append('printf("size %%zu\\n", sizeof(%s));' % tag)
    for m in members.split():
        src.append('printf("%s %%zu %%zu\\n", offsetof(%s, %s), sizeof(((%s *)0)->%s));' % (m, tag, m, tag, m))
    src.append('return 0; }')
    with tempfile.TemporaryDirectory() as d:
        c, exe = os.path.join(d, 'p.c'), os.path.join(d, 'p')
        open(c, 'w').write('\n'.join(src))
        r = subprocess.run(['cc', '-w', '-o', exe, c], capture_output=True, text=True)
        if r.returncode:
            return None
        out = subprocess.run([exe], capture_output=True, text=True).stdout.split('\n')
    lay = {}
    for l in out:
        p = l.split()
        if len(p) == 2: lay['size'] = int(p[1])
        elif len(p) == 3: lay[p[0]] = (int(p[1]), int(p[2]))
    return lay


def r2_layout(decl, name):
    with tempfile.TemporaryDirectory() as d:
        h = os.path.join(d, 't.h')
        open(h, 'w').write(decl + '\n')
        r = subprocess.run(['r2', '-q', '-e', 'asm.bits=64', '-c', 'to ' + h, '-c', 'tk~' + name, '-c', 'tsj ' + name, '--'],
                           capture_output=True, text=True, env=ENV)
    out, err = r.stdout, r.stderr.strip().replace('\n', ' | ')
    stored, tsj = {}, {}
    for l in out.split('\n'):
        for prefix in ('struct.' + name + '.', 'union.' + name + '.'):
            if l.startswith(prefix) and '=' in l:
                m, v = l[len(prefix):].split('=', 1)
                parts = v.split(',')
                if len(parts) >= 2 and parts[1].isdigit(): stored[m] = int(parts[1])
        if l.startswith('{'):
            try:
                for f in json.loads(l).get('fields', []): tsj[f['name']] = (f['offset'], f['size'])
            except ValueError:
                pass
    return stored, tsj, err


problems = 0
for case in CASES:
    title, decl, name, members, note = case[:5]
    cdecl = case[5] if len(case) > 5 else None
    truth = cc_layout(decl, name, members, cdecl)
    stored, tsj, err = r2_layout(decl, name)
    issues = []
    if not stored:
        issues.append('not loaded' + (' (' + err + ')' if err else ' (no error reported)'))
    elif truth:
        for m in members.split():
            if m not in truth: continue
            off = truth[m][0]
            if m not in stored: issues.append('%s: missing' % m)
            elif stored[m] != off: issues.append('%s: stored offset %d, C %d' % (m, stored[m], off))
            if m in tsj and tsj[m][0] != off: issues.append('%s: tsj offset %d, C %d' % (m, tsj[m][0], off))
    status = 'ok  ' if not issues else 'DIFF'
    if issues: problems += 1
    print('%s %-30s %s' % (status, title, '; '.join(issues) + (('  [' + note + ']') if note and issues else '')))
    if VERBOSE:
        print('     decl:  ' + decl.replace('\n', ' '))
        print('     cc:    ' + str(truth))
        print('     r2 tk: ' + str(stored) + '  tsj: ' + str(tsj))
print('%d/%d cases differ from the C compiler' % (problems, len(CASES)))
