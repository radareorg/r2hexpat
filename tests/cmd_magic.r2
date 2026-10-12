?e -- magic help
hexpatm?
?e -- types from a loaded file
hexpat -q demo/test.hexpat
hexpatm MachHeader
?e -- type-only export, includes and nested fixed layouts
hexpatm -f tests/magic_types.pat -I demo Header
hexpatm -f tests/magic_types.pat -I demo Header > /tmp/r2hexpat-header.magic
?e -- decode header at another address with pm
e io.cache=true
wx 4845585001001234887766554433221112345678785634120000c03f01feff00efbeadde00410042 @ 64
pm /tmp/r2hexpat-header.magic @ 64
?e -- exporting preserves the loaded file and supports alignment
hexpatl
hexpatm -f demo/player.hexpat -a 8 Player
?e -- unsupported fields and bad arguments
hexpatm -f tests/magic_types.pat -I demo Wide
hexpatm -f tests/magic_types.pat -I demo Dynamic
hexpatm MachHeader extra
hexpatm -a 3 MachHeader
?e -- discard staged test bytes
wcr
e io.cache=false
