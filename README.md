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
| `hexpat-v` | show the r2hexpat version |
| `hexpatj [file]` | patterns as JSON (`hexpatj~{}` to indent) |
| `hexpat* [file]` | patterns as r2 commands: flags in the `hexpat` flagspace, `Cd`/`Cs` data hints and value comments (`.hexpat*` applies them) |
| `hexpatl[j]` | list loaded files and their top-level patterns |
| `hexpate expr` | evaluate an expression or assignment in the last loaded file (`hexpate sizeof(header)`, `hexpate header.value = 3`) |
| `hexpats [file]` | one-line summary (types with their field count, enums, functions, patterns, size) or the error, meant for status bars |
| `hexpat?` | help |

Any `file` argument can be `base64:<data>` to evaluate the encoded source
directly, so frontends (like iaito) can feed the contents of an editor on every
change and show `hexpats base64:...` in a status bar for live feedback.

Addresses are r2 addresses: pattern offsets are translated by the binary's
base address (`ij.bin.baddr`), or `#pragma base_address 0x...`.

`hexpate header.value = 3` writes the field's bytes through r2 I/O, using its
declared size and byte order. Compound assignments (`+=`, `|=`, etc.), array
entries and bitfield members also work. Open r2 with `-w`, or enable
`e io.cache=true` to stage edits in r2's write cache. Assignments print nothing;
query the field again or use `p8` to inspect the result. Editing a count or
pointer does not rebuild the pattern layout; reload the pattern file when
its layout changes. Fields with `[[transform(...)]]` cannot be written because
the transform has no inverse.
Quote the whole r2 command when it contains operators that r2 handles itself,
for example `"hexpate header.value |= 8"` or `"hexpate header.value >= 3"`.

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
evaluates an expression or assignment in the global scope of an evaluated pattern and
`BufferHost` is a ready-made host over a `Uint8Array`. `HostHooks` adds
functions, types, pragma handlers and `in` variables, like the C++ runtime's
`addFunction`/`addType`/`addPragma`.

Hosts can implement `write(addr, bytes)` for interactive field assignments;
read-only hosts reject those writes. Assignments while evaluating a pattern
file retain ImHex's value overrides and do not write host data.

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
