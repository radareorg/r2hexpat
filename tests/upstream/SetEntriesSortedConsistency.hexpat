bitfield TemplateBitfield<auto N> {
    unsigned a : 2;
    unsigned b : 3;
};

TemplateBitfield<4> bf @ 0;
