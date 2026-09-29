# r2hexpat

[![CI](https://github.com/radareorg/r2hexpat/actions/workflows/ci.yml/badge.svg)](https://github.com/radareorg/r2hexpat/actions/workflows/ci.yml)

ImHex Pattern Language (`.hexpat`) implementation in TypeScript, shipped as a
host-independent library plus an r2js plugin.

--pancake

<p align="center"><img src="hexpat.jpg" alt="r2hexpat"></p>

## Build

You need radare2 and r2frida (for the `r2frida-compile` program) installed.

```
make
make user-install
```

## Run

r2 -q -i hexpat.r2.js -c 'hexpat demo/test.hexpat' /bin/ls

Commands (all output goes through r2's console, so `~grep` and `|` work):

| command | description |
| --- | --- |
| `hexpat [-q] [-I dir] [file]` | evaluate file (replacing the loaded ones) and show its patterns; without file show the loaded ones |
| `hexpat+ [-I dir] file` | evaluate file and add it to the loaded ones |
| `hexpat- [n]` | unload all loaded files (or the nth) |
| `hexpatj [file]` | patterns as JSON (`hexpatj~{}` to indent) |
| `hexpat* [file]` | patterns as r2 commands: flags in the `hexpat` flagspace, `Cd`/`Cs` data hints and value comments (`.hexpat*` applies them) |
| `hexpatl[j]` | list loaded files and their top-level patterns |
| `hexpate expr` | evaluate an expression in the context of the last loaded file (`hexpate sizeof(header)`, `hexpate $[0x10]`) |
| `hexpat?` | help |

Addresses are r2 addresses: pattern offsets are translated by the binary's
base address (`ij.bin.baddr`), or `#pragma base_address 0x...`.

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

`toJson(inst)` serializes the placed patterns, `inst.evaluateExpression(src)`
evaluates an expression in the global scope of an evaluated pattern and
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

`make test-corpus CORPUS=path/to/ImHex-Patterns` parses the whole
[ImHex-Patterns](https://github.com/WerWolv/ImHex-Patterns) corpus and
evaluates every pattern that ships sample data.

The conformance suite (`tests/upstream/`) holds the tests of the reference
C++ implementation, extracted by `tests/extract_upstream.py` from
`third_party/parser_cpp` and run against its `test_data`. Tests expected to
fail are listed in `tests/upstream/XFAIL`; `make test-upstream ARGS=-v`
shows errors and `ARGS=-u` regenerates the list. `sh tests/run_r2.sh -u`
regenerates the r2 goldens.

## Links

* [x64dbg data explorer](https://github.com/x64dbg/DataExplorer)
* [PatternLanguage C++ parser](https://github.com/WerWolv/PatternLanguage)
* [Frida's Go reimplementation](https://github.com/frida/frida-core.git)
* [Rust Hxy Library](https://github.com/landaire/hxy)
