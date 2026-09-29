bitfield NestedBitfield {
    nestedA : 4;
    nestedB : 4;
};

bitfield TestBitfield {
    unsigned a : 2;
    b : 3;
    NestedBitfield c;
    d : 4;
    signed e : 4;
    NestedBitfield f[c.nestedA];
};

be TestBitfield testBitfield @ 0x25;

std::assert(testBitfield.a == 0x01, "Field A invalid");
std::assert(testBitfield.b == 0x01, "Field B invalid");
std::assert(testBitfield.c.nestedA == 0x02, "Nested field A invalid");
std::assert(testBitfield.c.nestedB == 0x08, "Nested field B invalid");
std::assert(testBitfield.d == 0x08, "Field D invalid");
std::assert(testBitfield.e == -8, "Field E invalid");
std::assert(testBitfield.f[0].nestedA == 0x02, "Nested array[0] field A invalid");
std::assert(testBitfield.f[0].nestedB == 0x0A, "Nested array[0] field B invalid");
std::assert(testBitfield.f[1].nestedA == 0x08, "Nested array[1] field A invalid");
std::assert(testBitfield.f[1].nestedB == 0x0F, "Nested array[1] field B invalid");
