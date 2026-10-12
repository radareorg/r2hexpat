// Fields for the interactive assignment tests (writes stay in r2's I/O cache).
struct Header {
    u32 value;
    be u16 big;
    s8 signedValue;
    bool enabled;
};
Header header @ 0;
u32 alias @ 0;
u16 values[2] @ 8;
bitfield Bits {
    low : 3;
    bool enabled : 1;
    signed high : 4;
};
Bits bits @ 12;
be Bits big_bits @ 13;
bitfield Ordered {
    low : 3;
    high : 13;
} [[bitfield_order(1, 16)]];
be Ordered ordered @ 14;
char text[4] @ 16;
be char16 wide[2] @ 20;
float number @ 24;
be double big_number @ 28;
float16 half @ 36;
const u8 fixed = 7;
fn set_value(auto v) { header.value = v; };
