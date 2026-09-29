struct Outer {
    u8 bytes[16];
} [[sealed]];

struct Inner {
    u8 bytes[14];
} [[sealed]];

Outer outer @ 0;
Inner inner @ 0;

u8 before1 @ 1;
u8 before2 @ 2;
u8 before3 @ 3;
u8 before4 @ 4;
u8 before5 @ 5;
u8 before6 @ 6;
u8 before7 @ 7;
u8 before8 @ 8;
u8 before9 @ 9;
