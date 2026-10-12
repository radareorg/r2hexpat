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
| `hexpatp[?+=-ijl] ...` | build partial instances and masked search patterns (`hexpatp?` for help) |
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

## Search patterns

`hexpatp` instantiates a type without a backing address. All fields start
**unset**. Set only the fields you know; the rest, including padding, become
wildcards. Its normal output is a single `bytes:mask` argument for r2's `/x`,
including bit masks for individual bitfield members:

```sh
r2 -q -i hexpat.r2.js \
  -c '/x `hexpatp -f demo/player.hexpat -a 8 Player health=100 lives=3`' target.bin
```

`-f` compiles types and constant globals from a file, resolving includes with
`-I dir`. It does not decode placements or execute the file's top-level code
or `main()`. Without `-f`, the last file loaded with `hexpat` supplies the types.
The file can also be `base64:<data>`. One-shot patterns do not create a named
instance or change r2 I/O.

For interactive use, create a named instance and refine it:

```text
hexpatp+ -f demo/player.hexpat -a 8 wanted Player
hexpatpi wanted
hexpatp= wanted health=100 lives=3 role=Role::Rogue position.z=3
hexpatp wanted
/x `hexpatp wanted`
hexpatp- wanted role position
hexpatpi wanted
hexpatpj wanted
hexpatpl
hexpatp- wanted
```

| command | result |
| --- | --- |
| `hexpatp [options] Type [field=expr ...]` | one-shot `/x` pattern |
| `hexpatp name` | named instance's `/x` pattern |
| `hexpatp+ [options] name Type [field=expr ...]` | create a named instance |
| `hexpatp= name field=expr ...` | set fields atomically |
| `hexpatp- name field ...` | unset fields or entire nested aggregates |
| `hexpatp- name` / `hexpatp- *` | delete one / all named instances |
| `hexpatpi name` / `hexpatpj name` | inspect fields as text / JSON |
| `hexpatpl` / `hexpatplj` | list named instances as text / JSON |

Options go before the type or instance name: `-f file`, `-I dir`, and
`-a N` (also `--align N`). Nested paths and constant array indices work, e.g.
`position.z=3` and `values[2]=0x1234`. Values are hexpat expressions, including
enum names, arithmetic, booleans, and quoted strings with spaces. Multiple
assignments can be separated by whitespace or commas. A zero value is **set**;
it constrains zero bytes with `ff` mask bytes. An unset field contributes no
mask bits. JSON reports `defined` for each leaf and `unset`, `partial` or `set`
for the instance. Overlapping union fields are independent constraints;
conflicting values are rejected, and unsetting one preserves the others.

Quote the whole r2 command when it contains r2 operators or template brackets,
for example `"hexpatp -f types.hexpat Array<u16,2> values[1]=1|2"`.

The default layout is packed (`-a 1`). `-a 2`, `4`, `8` or `16` aligns each
member to its natural alignment, capped at that number, and includes struct
tail padding in array strides. Power-of-two scalar widths use their width
as their natural alignment; other widths and ImHex bitfields align to one
byte. `[[packed]]` on a type and `[[align(N)]]` on a member override this policy.
Explicit `padding[N]` and aggregate `[[fixed_size(N)]]` remain wildcarded.
Pointer widths stay explicit (`Player *next : u64;` in the example).

This is an explicit layout policy: it does not infer a C ABI or implement C
bitfield packing. Files with a non-packed `abi` pragma require an explicit `-a` selection.
Choose the layout that matches the target; r2's `search.align` separately
controls candidate addresses (e.g. `e search.align=8`). For background, see
[Frida's packed and native layout example](https://frida.re/news/2026/10/02/frida-17-20-0-released/).

Search types must have fixed, contiguous layouts. Arrays sized by an unset
field, variable-length arrays, conditionals, address-dependent layouts, and
transformed values are rejected instead of guessing their layout. Setting a
length field does not make a dynamic type static. `hexpat` and `hexpate` still
decode and modify ordinary placed patterns as before.

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

`SearchPattern` exposes the same partial instances without r2:

```ts
import { compile, SearchPattern } from "./lib/index";

const program = compile(source); // optional host resolves includes
const wanted = new SearchPattern(program, "Player", { alignment: 8 });
wanted.set({ health: 100, lives: 3, position: { z: 3 } });
wanted.isDefined("role");        // false
wanted.get("role");              // undefined
wanted.set("health", 0);         // a defined zero
wanted.assign("role=Role::Rogue");
wanted.unset("position");        // clear all position fields
wanted.state();                  // "partial"
const { bytes, mask } = wanted.encode(); // independent Uint8Array copies
console.log(wanted.toR2());
console.log(JSON.stringify(wanted));
```

`set()` merges partial objects and arrays, or sets a single field path;
`unset()` with no argument clears the whole instance. `state(path)` reports
aggregate state, `fields()` returns field offsets and definition status, and
`get(path)` returns `undefined` for unset leaves. Integer values are decoded
as `bigint`; supply `bigint` for values beyond JavaScript's safe integer range.
A pointer set to `null` is a defined zero pointer. Strings fill their fixed
field and pad with zero bytes. `SearchOptions` also accepts `maxSize` (default
1 MiB) and `maxFields` (default 65536). The library reads no target bytes while
creating or editing a search instance.

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
