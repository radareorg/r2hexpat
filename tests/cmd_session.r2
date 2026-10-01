?e -- help
hexpat?
?e -- load one file, list, evaluate expressions in its context
hexpat -q tests/syntax_functions.hexpat
hexpatl
hexpate fib(12)
hexpate pair.rest[1] + 1
hexpate sizeof(pair) * 2
hexpate typenameof(pair)
hexpate "ab" * 2 + 'c'
hexpate pair.rest
?e -- stack a second file
hexpat+ tests/syntax_enum.hexpat
hexpatl
hexpatlj
hexpate k
hexpat~probe
?e -- unload
hexpat- 0
hexpatl
hexpat-
hexpatl
?e -- expressions without a loaded file use the current data
hexpate $[0] + $[1]
hexpate u8(-1)
?e -- errors
hexpate nope
hexpat tests/does_not_exist.hexpat
hexpats tests/does_not_exist.hexpat
?e -- one line stats, inline base64 sources
hexpats tests/syntax_structs.hexpat
hexpats
hexpats base64:Ly8gU3RydWN0cywgbmVzdGVkIHN0cnVjdHMsIHVuaW9ucwpzdHJ1Y3QgSGVhZGVyIHsKICAgIHUzMiBtYWdpYzsKICAgIHUxNiB2ZXJzaW9uOwogICAgdTE2IGZsYWdzOwogICAgdTY0IHRpbWVzdGFtcDsKfTsKdW5pb24gV29yZCB7CiAgICB1MzIgdmFsdWU7CiAgICB1OCBieXRlc1s0XTsKfTsKc3RydWN0IEZpbGUgewogICAgSGVhZGVyIGhlYWQ7CiAgICBXb3JkIHdvcmQ7CiAgICB1OCBsZW47CiAgICB1OCBkYXRhW2xlbiAlIDRdOwp9OwpGaWxlIGZpbGUgQCAweDAwOwp1MzIgZm9vdGVyIEAgJDsK
hexpatl
hexpats base64:c3RydWN0IEEgeyB1OCB4OyA=
