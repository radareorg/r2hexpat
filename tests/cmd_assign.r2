?e -- assignments write r2 I/O
e io.cache=true
hexpat -q tests/edit_fields.pat
hexpate alias + 0
hexpate header.value= 3
p8 4 @ 0
hexpate header.value
hexpate alias + 0
hexpate header.value += 2
hexpate header.value == 5
"hexpate header.value >= 5"
"hexpate header.value |= 8"
hexpate header.value + 0
hexpate "a=b"
hexpate header.big = 0x1234
hexpate header.signedValue = -2
hexpate header.enabled = false
p8 8 @ 0
hexpate values[1] = 0x5678
hexpate values[0] = values[1] + 1
p8 4 @ 8
?e -- bitfields preserve neighboring bits
wx ffffffff @ 12
hexpate bits.low = 3
hexpate bits.enabled = false
hexpate bits.high = -2
hexpate big_bits.low = 3
hexpate big_bits.enabled = false
hexpate ordered.low = 3
p8 4 @ 12
?e -- strings and floats use the declared byte order
hexpate text = "ab"
hexpate wide = "A"
hexpate text[1] = 'c'
hexpate wide[1] = 'B'
p8 8 @ 16
hexpate number = 1.5
hexpate big_number = -2.0
hexpate half = 1.5
p8 14 @ 24
?e -- function assignments and other loaded sessions share I/O
hexpat+ -q tests/edit_fields.pat
hexpate set_value(9)
hexpat~value (u32)
?e -- reads refresh after an external write
wx 0a000000 @ 0
hexpate header.value + 0
hexpat~value (u32)
?e -- read-only I/O rejects writes without changing the field
wcr
e io.cache=false
hexpate header.value= 3
p8 4 @ 0
hexpate header.value + 0
?e -- base addresses also apply to writes
e io.cache=true
omv 1 0x1000
hexpat -q base64:I3ByYWdtYSBiYXNlX2FkZHJlc3MgMHgxMDAwCnN0cnVjdCBIZWFkZXIgeyB1MzIgdmFsdWU7IH07IEhlYWRlciBoZWFkZXIgQCAwOw==
hexpate header.value = 3
p8 4 @ 0x1000
hexpate header.value
