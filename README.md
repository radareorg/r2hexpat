# imhexpat

[![CI](https://github.com/radareorg/r2hexpat/actions/workflows/ci.yml/badge.svg)](https://github.com/radareorg/r2hexpat/actions/workflows/ci.yml)

ImHex Pattern Language (.hexpat) evaluator for radare2, written in TypeScript,
bundled with `r2frida-compile` into a QuickJS-compatible r2js plugin.

## Build

    make                    # bundles with r2frida-compile
    npm ci && make BUNDLER=esbuild   # or with esbuild from node_modules

## Test

    make check              # tsc type-check (lint)
    make test               # unit + r2 golden + upstream conformance suite

## Run

    r2 -q -i hexpat.r2.js -c 'hexpat demo/test.hexpat' /bin/ls

Inside an interactive r2 session:

    [0x00000000]> hexpat demo/test.hexpat

Pattern offsets are translated to the loaded binary's base address
automatically (or set explicitly with `#pragma base_address 0x...`).

## Files

- tsconfig.json                        - TypeScript settings (`make check` runs `tsc`)
- lib/lexer.ts, lib/parser.ts, lib/ast.ts - language front-end
- lib/evaluator.ts                     - pattern runtime (cursor, placements, control flow)
- lib/r2pipe.ts                        - memory reads over r2js (`p8`), td/tl helpers
- lib/index.ts                         - runHexpat() + r2js plugin registration
- tests/unit.ts                        - standalone test with mock r2 bridge
- tests/*.hexpat(.golden)              - r2 golden-file tests against tests/sample.bin
