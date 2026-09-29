// Enums: explicit + auto values, underlying type, constant resolution
enum Kind : u8 { A = 1, B = 5, C, D = 0x10 };
Kind k @ 0x1d;
enum Color : u32 { Red, Green = 10, Blue };
u32 probe @ Color::Blue;
u32 b_val = Color::Blue;
u8 probe2 @ b_val;