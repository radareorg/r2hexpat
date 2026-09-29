struct a {
    u8 c;
    u8 d;
    match(c, d) {
        ((0x78 - 0x10) | 5 | 3, _): u8 h;
        (0x77 | 0x80 | 0x87, _): u8 l;
        (_, _): u8 k;
    }
};

a b @ 0x100;
