// Control flow: if/else placement, while-sized arrays, for loops with locals
u32 magic @ 0x00;
if (magic != 0) {
    u16 a @ $;
} else {
    u8 b @ $;
}
u8 n @ $;
u8 run[while($ < 0x10)] @ $;
u32 total = 0;
for (u32 i = 0, i < n % 8, i += 1)
    total += i;
std::print("total={} n={}", total, n);
