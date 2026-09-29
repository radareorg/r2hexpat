?e -- json
hexpatj tests/syntax_bitfields.hexpat
hexpatj tests/syntax_functions.hexpat
?e -- r2 script
hexpat* tests/syntax_functions.hexpat
hexpat* tests/syntax_strings.hexpat
?e -- apply it
.hexpat* tests/syntax_structs.hexpat
fs hexpat
f
CC.@hexpat.file.len
