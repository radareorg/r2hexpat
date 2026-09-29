// Arrays: fixed, struct arrays, null-terminated, char arrays as strings
u8 head[4] @ 0x00;
struct Point { u8 x; u8 y; };
Point pts[3] @ $;
u8 tail[4] @ 0xffc;
u8 nulterm[] @ 0x51;
char text[4] @ 0x00;
