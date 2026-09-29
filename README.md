# imhexpat

ImHex Pattern Language (.hexpat) evaluator for radare2, written in TypeScript,
bundled with `r2frida-compile` into a QuickJS-compatible r2js plugin.

## Build

    make

## Run

    r2 -q -i hexpat.r2.js -c 'hexpat demo/test.hexpat' /bin/ls

Inside an interactive r2 session:

    [0x00000000]> hexpat demo/test.hexpat

Pattern offsets are translated to the loaded binary's base address
automatically (or set explicitly with `#pragma base_address 0x...`).

## Files

- lexer.ts / parser.ts / ast.ts   - language front-end
- evaluator.ts                    - pattern runtime (cursor, placements, control flow)
- r2pipe.ts                        - memory reads over r2js (`p8`), td/tl helpers
- index.ts                         - runHexpat() + r2js plugin registration
- test_parser.ts                   - standalone test with mock r2 bridge
