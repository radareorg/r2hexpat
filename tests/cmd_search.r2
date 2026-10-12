?e -- search help
hexpatp?
?e -- one-shot patterns from a file, independent of current data
hexpatp -f demo/player.hexpat Player health=100 lives=3
hexpatp -f demo/player.hexpat -a 8 Player health=100 lives=3
hexpatp -f tests/search_types.pat Text name="a=b c" code=0x1234
"hexpatp -f tests/search_types.pat Array<u16,2> values[1]=1|2"
?e -- named instances start unset, including zero-valued fields
hexpatp+ -f demo/player.hexpat -a 8 wanted Player
hexpatpi wanted
hexpatp= wanted health=0 lives=3 position.z=3
hexpatpi wanted
hexpatp- wanted health position
hexpatpl
hexpatplj
hexpatpj wanted
?e -- use types from the last loaded file
hexpat -q demo/player.hexpat
hexpatp Player health=100 lives=3
?e -- real /x searches with wildcard padding and unknown fields
e io.cache=true
wx 640000000300000001ffffff112233445566778899aabbccddeeff0011223344 @ 0
wx 640000000300000002ffffff112233445566778899aabbccddeeff0011223344 @ 64
e search.in=io.maps
e search.from=0
e search.to=96
e search.align=8
e search.flags=false
hexpatp= wanted health=100
/x `hexpatp wanted`
hexpatp= wanted role=Role::Rogue
/x `hexpatp wanted`
?e -- arbitrary bit masks match only the selected bitfield
wx 030bf3ff @ 96
e search.from=96
e search.to=100
e search.align=1
/x `hexpatp -f tests/search_types.pat Bits low=3`
?e -- errors preserve the named instance
hexpatp+ wanted Player
hexpatp= wanted health=2 nope=3
hexpatp wanted
hexpatp -f tests/search_types.pat Dynamic length=3
hexpatp- wanted missing
?e -- delete named instances and discard staged test bytes
hexpatp- wanted
hexpatplj
wcr
e io.cache=false
p8 8 @ 0
