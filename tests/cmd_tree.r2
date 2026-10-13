?e -- decode types without loading a session
hexpatt -f tests/tree_types.pat Header @ 0
hexpattj -f tests/tree_types.pat Header 8
hexpatlj
?e -- current seek and address expressions
s 8
hexpatt -f tests/tree_types.pat Header
f tree.address 1 @ 8
hexpatt -f tests/tree_types.pat Header tree.address
?e -- base address, inline sources and include directories
omv 1 0x1000
hexpattj -f base64:I3ByYWdtYSBiYXNlX2FkZHJlc3MgMHgxMDAwCiNpbmNsdWRlIDx0cmVlX3R5cGVzLnBhdD4K -I tests Header 0x1008
omv 1 0
?e -- loaded pattern trees and one-shot types preserve the session
hexpat -q tests/syntax_structs.hexpat
hexpatt file.head
hexpatt file.data[0]
hexpattj file.head.version
hexpatt Header 4
hexpatl
?e -- generated flag colors and comments
hexpatt* -f tests/tree_types.pat Header 0
fs other
f other.keep 1 @ 0
.hexpatt* -f tests/tree_types.pat Header 0
fs
fs hexpat
fc*
fC hexpat.value.count
?e -- regular flag export carries colors too
hexpat* base64:c3RydWN0IENvbG9yIHsgdTggdGFnIFtbY29tbWVudCgiY29sb3JlZCBmaWVsZCIpXV07IH0gW1tjb2xvcigiQUJDREVGIildXTsgQ29sb3IgY29sb3JlZCBAIDA7
.hexpat*
fc*
hexpate std::core::set_pattern_color(colored, 0x00332211)
hexpatt colored
.hexpat*
fc*
?e -- cleanup preview and application preserve sessions and unrelated flags
hexpat-*
f keep 1 @ 8
fs other
f hexpat.outside 1 @ 0
.hexpat-*
f
fs hexpat
f
hexpatl
?e -- cleanup also works after unloading
hexpat-
.hexpatt* -f tests/tree_types.pat Header 8
hexpat-
.hexpat-*
f
?e -- errors
hexpatt -f tests/tree_types.pat
hexpatt -f tests/tree_types.pat Missing 0
hexpatt -f tests/tree_types.pat Header -1
hexpatt -f tests/tree_types.pat Header 0x100000
hexpatt -f tests/tree_types.pat Header no.such.address
hexpatt Header
