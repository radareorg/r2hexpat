// Arithmetic in placements
u8 a @ 0x00;
u32 b @ a + 8;
u32 c @ a * 2;
std::print("{} {:#x} {:08X}", a, b, c);
