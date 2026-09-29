# ImHex patterns vs radare2 C types

ImHex pattern files (`.hexpat`) and radare2's C types (`td`, `to`, `ts`,
`tp`, `tl`, parsed by `libr/anal/c2`) both talk about "structs", "enums" and
"arrays", which makes them look interchangeable. They are not: they answer
different questions, at different stages of an analysis, and each is good at
exactly what the other one cannot do. This document explains the differences
in design, purpose and use cases, how r2hexpat lets them coexist inside r2,
and why r2's C type parser should **not** grow ImHex features.

## At a glance

| | ImHex pattern language | radare2 C types |
| --- | --- | --- |
| What it is | A small programming language that is **executed against the data** | **Declarations** of C types, as a C compiler sees them |
| Question it answers | "What is in these bytes?" | "What is the shape of this program's objects and functions?" |
| Output | A tree of patterns: concrete names, addresses, sizes and **values** | Type records in the sdb (`tk`), used by other commands |
| Layout | Exactly the bytes the program consumed: packed, endianness per value, sizes computed at runtime | The target ABI: alignment, padding, pointer size from `asm.bits` |
| Sizes | Data dependent (`u8 data[header.len]`, `[while(...)]`, `[]`) | Static (constant array bounds) |
| Control flow | `if`, `match`, loops, functions, `break`/`continue`/`return`, `try` | None: a type is a description, not a procedure |
| Presentation | Attributes: `format`, `transform`, `name`, `color`, `hidden`, `sealed`, visualizers | `pf` format strings derived from the type, `tp` / `tl` views |
| Typical input | File formats, network protocols, firmware images, save games | Headers of the analyzed program, libc/OS headers, function signatures |
| Main consumers | The person reading the data | r2's analysis: calling conventions, type propagation, variables, decompilers, `pdc`/`afs`, struct views |

## Purpose and design

### ImHex patterns: a parser written as a program

A pattern file is a program. Declaring a variable reads bytes at a cursor
(`$`) and advances it; conditions and loops decide what to read next;
functions compute offsets, validate magic values and format the result. The
language is built around data-dependent structure:

- sizes come from values already read: `u8 payload[header.length];`
- arrays end on conditions: `Chunk chunks[while(!std::mem::eof())];`
- layout branches on content: `match (type) { (1): Foo foo; (2): Bar bar; }`
- placement jumps around the data: `Table table @ header.table_offset;`
- endianness is a property of each value (`be u32`, `#pragma endian big`)
- values are transformed and formatted for humans: `[[transform("..."), format("...")]]`

The result is a tree of *instances* with concrete values. There is no notion
of an ABI, alignment or a target architecture: a pattern describes bytes as
they are stored, which is what file formats need (they are packed, and their
byte order is fixed by the format, not by the machine reading them).

The runtime is also a sandbox: evaluation depth, array and pattern limits,
no filesystem access by default, sections for decompressed or synthesized
data (`std::mem::create_section`).

### radare2 C types: the analyzed program's type system

radare2's C types describe what the *analyzed program* was compiled with.
They are declarations (`struct`, `union`, `enum`, `typedef`, function
prototypes) stored in the type database and consumed by the analysis:

- function signatures and calling conventions (`afs`, `tf`, `afc`) so that
  arguments, return values and variables get types
- type propagation through the code (`types.*` settings), struct member
  access views and xrefs (`tv`, `tx`), synthesized structs for pointer arguments
- viewing memory as a type (`tp`, `tl` + `tll`, `pf` formats) with the
  layout the program itself uses: alignment, padding and pointer size of the
  target (`asm.bits`)
- loading system and project headers (`to`, `dir.types`) so that imports and
  known APIs are typed

Here layout must follow the C ABI: if the program accesses `s->count` at
offset 8, the type must put `count` at offset 8 for every tool that reads it.
Everything is static because a compiler resolves it at build time.

### Why the two should stay separate

Most of what makes the pattern language useful (runtime sizes, control flow,
functions, transforms, sections) has no meaning in a C type, because a C type
never looks at data. Conversely most of what makes C types useful (ABI
layout, pointer size, prototypes, calling conventions) has no meaning in a
pattern, which never describes code. Growing the C parser into a pattern
evaluator would give r2 two half languages; keeping them apart lets each one
be correct for its job. r2hexpat therefore implements the pattern language as
its own library and uses r2 only as a host (memory reads, flags, comments).

## Use cases

| You want to... | Use |
| --- | --- |
| Parse a file format, a packet or a firmware blob with length fields and variable sections | a pattern |
| Validate magic values, checksums, version-dependent layouts | a pattern (`std::assert`, `match`, `std::hash`) |
| Decode compressed or encoded content into a new view | a pattern (sections) |
| Give a function its prototype so arguments and return values get types | C types (`afs`, `td`) |
| Tell the analysis that `rdi` points to `struct task` and name its members in the disassembly | C types (`afs`, `tv`, type propagation) |
| Import an SDK or OS header to type calls to known APIs | C types (`to`) |
| View an in-memory object of the analyzed program (heap object, global) with its ABI layout | C types (`tp`, `tl`) |
| Annotate a binary blob inside an executable (resources, embedded images, config tables) | a pattern, then `hexpat*` to get flags and comments |
| Script over decoded values | `hexpatj` (JSON) or `hexpate` (expressions) |

## How r2hexpat connects them

r2hexpat evaluates patterns inside r2 and turns the result into things r2
already understands, without asking the C type system to understand patterns:

- `hexpat*` emits r2 commands: flags (`hexpat.header.magic`) in the
  `hexpat` flagspace, data hints (`Cd`, `Cs`) so the disassembly shows data,
  and comments with the decoded values
- `hexpatj` emits the pattern tree as JSON, `hexpatl` lists loaded patterns,
  `hexpate` evaluates expressions (`hexpate sizeof(header)`)
- addresses are r2 addresses (pattern offsets plus the binary's base address)

A possible next step is exporting *concrete* layouts as C types: after
evaluation every dynamic size is known, so a placed struct could be written as
a C struct with explicit padding members and `tl`-linked at its address. That
only works for the static subset (no transforms, no unions of different
branches) and it needs the C layout to be exact, which is why the findings
below matter: a packed hexpat layout cannot be expressed reliably today.

## Semantics that differ

| Topic | Pattern language | C types |
| --- | --- | --- |
| Integer types | `u8`..`u128`, `s8`..`s128`, also 24/48/96-bit | `uint8_t`..`uint64_t`, `char`/`short`/`int`/`long` (ABI sized) |
| Alignment | none: members follow each other | ABI alignment and padding, tail padding for arrays |
| Endianness | per value (`be`/`le`), per file (`#pragma endian`), changeable at runtime | the target's (`cfg.bigendian`) |
| Pointers | `T *p : u32` reads an offset of an explicit width and places `T` there, optional `pointer_base` | machine pointers of `asm.bits` width |
| Enums | explicit underlying type (`enum E : u8`), ranges (`A = 1 ... 9`) | `int`-sized (C23 fixed underlying types are not parsed) |
| Bitfields | a dedicated `bitfield` type, bit order and endianness under control | C bitfields (compiler-defined layout; not parsed by c2 today) |
| Strings | `char s[N]`, null-terminated `char s[]`, `str` values | `char s[N]`, `char *` |
| Arrays | fixed, expression-sized, `while`-terminated, null-terminated | constant bounds |
| Aliases | `using T = U;` (also templates) | `typedef` |
| Generic code | templates `struct Box<T, auto N>` | none |

## r2hexpat status (September 2026)

- the upstream conformance suite (81 tests of the reference C++ runtime) and
  our own regression tests pass, under node and inside r2's QuickJS
- the ImHex-Patterns corpus (`make test-corpus CORPUS=...`): all 358 files
  (patterns and the std/type/hex libraries) parse, and all 205 sample files
  of the top-level patterns evaluate without error, which is the criterion
  upstream's own CI uses
- not done: comparing the resulting pattern trees value by value against the
  C++ runtime, the `hex::*` editor-only functions, `std::file`, visualizers

## Appendix: C constructs radare2's C type parser gets wrong

While checking whether pattern layouts could be exported as C, plain C
declarations (no ImHex features) were loaded with `to` and compared with what
the C compiler computes (`offsetof`/`sizeof`). The probe is
`tests/r2ctypes_probe.py`; results below are from radare2 6.2.3 (git) on
arm64, whose layout rules match x86_64 SysV for these cases.
17 of 20 cases differ.

**Layout**

1. **stdint types get the default alignment.** `kvc_type_align()` in
   `libr/anal/c2/kv.c` recognizes sizes by suffix (`endswith "8"`, `"16"`,
   `"64"`), but `uint8_t`, `uint16_t` and `uint64_t` end with `_t`, so they
   all align to 4. `struct { uint8_t a; uint16_t b; uint8_t c; uint64_t d; }`
   is stored with `b@4 c@8 d@12` instead of `b@2 c@4 d@8`. `bool` has the same
   problem (`bool ok` after a byte lands at 4, not 1).
2. **`tsj` disagrees with the stored layout.** The sdb records the aligned
   offsets (`tk` shows `struct.t.b=uint32_t,4,0`) and `ts`/`tp` use them, but
   `tsj` recomputes offsets without any alignment (`b@1 c@5`). Every struct
   with padding reports wrong offsets in JSON.
3. **Struct and array members have the wrong size.** A nested
   `struct in inner;` or `struct el e[2];` does not account for the member's
   real size: in `struct t { struct el e[2]; uint8_t z; }` the member `z` is
   stored at 4 (C: 32); after a nested struct the next member is at 8 (C: 12).
4. **No tail padding for array elements.** `tp` of an array of
   `struct { uint64_t a; uint8_t b; }` uses a 9-byte stride instead of 16.
5. **Packing is ignored.** `__attribute__((packed))` after the closing brace
   is accepted but the stored offsets stay aligned; r2's own `/// @packed`
   attribute is not applied either.

**Syntax (valid C that fails or is silently mis-parsed)**

6. **Bitfields** (`uint32_t lo : 3;`) fail with "Missing semicolon in struct
   member".
7. **Anonymous members** (`union { uint32_t i; float f; } u;`) fail the same way.
8. **Multiple declarators** (`uint8_t a, b, c;`) are silently dropped: the
   struct loads without `a`, `b` and `c`.
9. **Array size expressions:** `uint8_t a[2 * 4];` is silently mis-parsed
   (the member disappears or becomes a field named `4_` of type
   `uint8_t buf2[2 *`); `a[4 + 4]` is a parse error. Hex literals work.
10. **`struct __attribute__((packed)) name { ... }`** (attribute before the
    tag, common GCC style) is a parse error.
11. **One error discards the whole header:** a single unsupported
    declaration in a file loaded with `to` drops every other (valid)
    declaration of that file.
12. **Silent failures:** several cases above load nothing and print no error.

**Printing**

13. `tp` prints a `char *` member as an inline string read at the member's
    own offset instead of following the pointer (`pf` `z` instead of `*z`).

Not counted as bugs: C23 `enum E : uint8_t`, `__int128` and `char16_t` are
not supported. They would matter for exporting patterns but are extensions
of C89/C99, not errors in what the parser claims to support.
