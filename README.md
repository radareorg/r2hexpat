# r2hexpat

[![CI](https://github.com/radareorg/r2hexpat/actions/workflows/ci.yml/badge.svg)](https://github.com/radareorg/r2hexpat/actions/workflows/ci.yml)

ImHex Pattern Language (`.hexpat`) implementation in TypeScript, shipped as a
host-independent library plus a radare2 (r2js / QuickJS) plugin.

## Build

    make                              # bundles r2/plugin.ts with r2frida-compile
    npm ci && make BUNDLER=esbuild    # or with esbuild from node_modules

## Run

    r2 -q -i hexpat.r2.js -c 'hexpat demo/test.hexpat' /bin/ls

Inside an interactive r2 session:

    [0x00000000]> hexpat [-q] [-I includedir] file.hexpat

Pattern offsets are translated to the loaded binary's base address
(`ij.bin.baddr`), or set explicitly with `#pragma base_address 0x...`.

## Library

The library in `lib/` never talks to radare2. Embedders implement
`HexpatHost` (`lib/host.ts`) to provide the data and resolve includes:

```ts
import { runHexpat, HexpatHost } from "./lib/index";

const host: HexpatHost = {
  size: () => data.length,
  read: (addr, size) => data.subarray(addr, addr + size),
  print: (msg) => console.log(msg),              // std::print output
  resolve: (path, from) => undefined,            // #include / import sources
};
const inst = runHexpat(src, host);
inst.dump();
```

`BufferHost` is a ready-made host over a `Uint8Array`. `HostHooks` adds
functions, types, pragma handlers and `in` variables, like the C++ runtime's
`addFunction`/`addType`/`addPragma`.

## Test

    make check              # tsc type-check (lint)
    make test               # everything below
    make test-unit          # mock-host unit test
    make test-upstream      # upstream conformance suite under node
    make test-r2            # r2 golden tests: tests/*.hexpat vs .golden on tests/sample.bin
    make test-upstream-r2   # upstream suite inside r2's QuickJS (one r2 process)

The conformance suite (`tests/upstream/`) holds the tests of the reference
C++ implementation, extracted by `tests/extract_upstream.py` from
`third_party/parser_cpp` and run against its `test_data`. Tests expected to
fail are listed in `tests/upstream/XFAIL`; `make test-upstream ARGS=-v`
shows errors and `ARGS=-u` regenerates the list. `sh tests/run_r2.sh -u`
regenerates the r2 goldens.

## Files

- `lib/lexer.ts`       - tokenizer and preprocessor
- `lib/parser.ts`      - recursive descent parser producing `lib/ast.ts`
- `lib/evaluator.ts`   - pattern runtime (types, placement, scopes, memory)
- `lib/stdlib.ts`      - built-in `std::` functions and `std::format`
- `lib/patterns.ts`    - pattern tree
- `lib/memory.ts`      - host data cache, heap and `std::mem` sections
- `lib/host.ts`        - host interface
- `lib/index.ts`       - public API
- `r2/plugin.ts`       - r2 core plugin (`hexpat` command), `R2Host`
