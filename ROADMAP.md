# ImHex Pattern Language for radare2 - Roadmap

1:1 parity with the official ImHex implementation (ref: [pattern_language](https://github.com/WerWolv/ImHex-Patterns), C++/Go/Rust impls), verified by a golden-file test suite driven by r2 oneliners.

## ✅ Done & Tested
- [x] Core Lexer & Parser (recursive descent)
- [x] Scalar types: `u8/u16/u32/u64/u128`, `i8/i16/i32/i64/i128`, `float/double/float16`, `char`, `bool`, `padding`
- [x] Exact 64/128-bit reads via `BigInt` (no double precision loss)
- [x] Structs & unions (incl. inside arrays, arrays of structs with per-element names/sizes)
- [x] Placements `@` (absolute, relative, expr-based) — cursor advances to end of placed var
- [x] Arithmetic/comparison/logical expressions, ternary `?:`
- [x] `if`/`else`, bounded `while` incl. pattern placement inside branches/loops
- [x] Local vars & assignment (`u32 x = 0;`, `x = x + 1;`) with scope-aware update
- [x] Fixed arrays `u8 a[N]` (scalars, structs), sentinel while-arrays `u8 a[while(...)]`
- [x] `using T = u32;`, `enum` (parse+read), `bitfield` (parse+read, no field decode)
- [x] Namespaces `namespace NS { }; NS::T x;`
- [x] `sizeof()`, string/strz reads
- [x] Base-address translation (`ij.bin.baddr`), `p8`-based memory reads
- [x] Test suite: `make test` (node mock) + `make test-r2` (golden files vs `tests/sample.bin`)

## 🐛 Bugs to Fix (found by probes)
- [ ] **strz doesn't advance cursor** — size must be strlen+1, not static 0
- [ ] **String dump mangles output** — escape control chars (`\n`, `\r`, non-printables) in dump
- [ ] **Unsized arrays `u8 rest[];` read as single element** — must read until EOF
- [ ] **Enum displays raw value** — resolve and show matching constant name (`E::A`)
- [ ] **Bitfields don't decode fields** — `bitfield BF { a: 3, b: 5 };` must expose a/b members

## 🚀 Phase 1: Language Completeness
- [ ] **`for` loops** — `for (u32 i = 0; i < n; i = i + 1) { ... }` (parse error today)
- [ ] **`fn` definitions & calls** — `fn f(u8 x) { return x + 1; }` (param parse broken)
- [ ] **`match` statements** — `match (x) { 1: {...} 2: {...} }` (parse error today)
- [ ] **Pointer semantics** — `u8 *p;` must read pointer-sized address, create deref'd pattern at target
- [ ] **`import std;`** — currently parse error (`import "file"` only); tolerate namespace imports
- [ ] **`break`/`continue` in loops** (parse; verify runtime)
- [ ] **Attributes `[[...]]`** — parsed, ignored; apply color/format in dump (low priority)

## 🚀 Phase 2: std Library Parity
- [ ] `std::string` (with encodings), `std::vector` (fixed/dynamic)
- [ ] Core fns: `std::print`, `std::format`, `std::assert`, `std::has_attribute`
- [ ] `std::mem` helpers (`std::mem::size`, `std::mem::eof`)

## 🚀 Phase 3: r2 Integration Polish
- [ ] JSON output mode (`hexpatj`) for scripting
- [ ] Push types into r2's type database (`td`) and link at addresses (`tl`) — API stubs exist, unused
- [ ] Error messages with line:col on all paths
- [ ] Performance: batch `p8` reads (windowed caching) instead of per-byte commands

## 🧪 Testing Strategy
1. Every feature: new `tests/syntax_*.hexpat` + `.golden`, run via `make test-r2`
2. Goldens verified against ground truth (`r2 -c 'p8'` / `pf`)
3. `make test` node harness for AST/runtime units