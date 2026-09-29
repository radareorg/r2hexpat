// Arrays: fixed, struct arrays, unsized (to EOF)
u8 head[4];
struct Point { u8 x; u8 y; };
Point pts[3];
u8 tail[] @ 0xff0;