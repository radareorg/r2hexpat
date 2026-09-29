# ImHex Pattern Language for radare2 - Roadmap

1:1 parity with the official ImHex implementation (ref: [PatternLanguage](https://github.com/WerWolv/PatternLanguage),
C++/Go/Rust impls in `third_party/`), verified by the upstream conformance
suite (`tests/upstream`, 81/81 passing under node and inside r2) and r2
golden tests.

## ✅ Done & Tested
- [x] Lexer: BigInt literals (`U`/`F`/`D` suffixes, hex/bin/oct), full escape set incl. `\u`/`\U` (UTF-8), escape errors
- [x] Preprocessor: `#define`, `#undef`, `#ifdef`/`#ifndef`/`#else`/`#endif`, `#include`, `#pragma`, `#error`
- [x] Scalars `u8..u128`, `s8..s128` (incl. 24/48/96-bit), `float/double/float16`, `char/char16`, `bool`, `str`, `padding`
- [x] Structs, unions, inheritance, enums (auto values, ranges, formatting), bitfields (LE/BE bit order, `bitfield_order`, signed/bool/enum fields, nested and arrays)
- [x] Arrays: fixed, `while(...)`, null-terminated `[]`, lazy static arrays, char arrays as strings, bounds errors
- [x] Pointers (`T *p : u32`), pointer arrays, `pointer_base`
- [x] Placements `@` with `in section`, global cursor semantics, u64 `$` arithmetic, `$[addr]`
- [x] Local variables in a zeroed heap (memory-backed: union overlap, aggregate copies, `auto` copies)
- [x] Templates (type and `auto` value parameters, alias templates, forward declarations), `typenameof` display names
- [x] Namespaces (incl. `namespace auto`), `using`, `import X as Y`, `import * from X as T`, `#include` with `#pragma once`
- [x] Control flow: `if`, `while`, `for`, `match` (ranges, alternatives, ambiguity error), `break`/`continue`/`return`, `try`/`catch`
- [x] Functions: defaults, `ref` params, parameter packs, recursion, `main` entry point
- [x] Attributes: `format`, `transform`, `fixed_size`, `no_unique_address`, `sealed`, `hidden`, `name`, `comment`, `color`, `export`
- [x] Built-in std: `assert`, `print`, `format` (fmt specs), `std::mem` (sections, reads), `std::core`, `std::string`, `std::math`
- [x] Semantic errors: redeclarations, const assignment, division by zero, bad string ops, arity, undefined functions
- [x] Host-independent library (`HexpatHost`), r2 plugin in `r2/`, paged reads (4K `p8`)

## 🚀 Next
- [ ] Load the real ImHex std library (`import std.mem;` etc. from an ImHex-Patterns checkout via `-I`); today `std`/`type`/`hex` imports are ignored when not found and only the built-in subset is available
- [ ] Verify pattern trees of the upstream tests (the C++ suite compares them; we only check evaluation succeeds/fails)
- [ ] JSON output mode (`hexpatj`) for scripting
- [ ] Push types into r2's type database (`td`) and link at addresses (`tl`), flags per pattern
- [ ] Remaining attributes: `inline`, `single_color`, `format_entries`, `transform_entries`, visualizers (parsed and stored, not applied)
- [ ] `std::hash`, `std::time`, `std::random`, `std::file` builtins

## 🧪 Testing Strategy
1. Upstream behaviour first: `tests/upstream` (re-extract with `tests/extract_upstream.py`)
2. r2 integration: `tests/*.hexpat` + `.golden`, values checked against `p8`/`xxd` ground truth
3. Every new feature: a golden test or an upstream-style assert test
