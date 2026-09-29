// Arithmetic and precedence
std::assert(2 + 3 * 4 == 14, "Multiplication precedence failed");
std::assert((2 + 3) * 4 == 20, "Parenthesized addition failed");
std::assert(24 / 3 / 2 == 4, "Division associativity failed");
std::assert(24 / (3 / 2) == 24, "Parenthesized division failed");
std::assert(20 - 6 - 4 == 10, "Subtraction associativity failed");
std::assert(20 - (6 - 4) == 18, "Parenthesized subtraction failed");
std::assert(17 % 5 == 2, "Positive modulo failed");
std::assert(-17 % 5 == -2, "Negative modulo failed");
std::assert(0 * 0xFFFFFFFF == 0, "Multiplication by zero failed");
std::assert(7 * 6 + 5 == 47, "Mixed arithmetic failed");
std::assert(7 + 6 * 5 == 37, "Mixed arithmetic precedence failed");
std::assert(100 / 4 + 3 * 2 == 31, "Division/addition precedence failed");

// Comparison boundaries
std::assert(-2 < -1, "Negative less-than failed");
std::assert(-1 > -2, "Negative greater-than failed");
std::assert(-1 <= -1, "Negative less-than-or-equal failed");
std::assert(-1 >= -1, "Negative greater-than-or-equal failed");
std::assert(0 == 0U, "Mixed zero equality failed");
std::assert(1 != -1, "Mixed signed inequality failed");
std::assert(0.5F < 1.0D, "Float comparison failed");
std::assert(1.5D >= 1.5F, "Mixed float comparison failed");

// Boolean and ternary expressions
std::assert(!(true && false), "Boolean and failed");
std::assert(true || false, "Boolean or failed");
std::assert(true ^^ false, "Boolean xor true case failed");
std::assert(!(true ^^ true), "Boolean xor false case failed");
std::assert((true ? 11 : 22) == 11, "True ternary branch failed");
std::assert((false ? 11 : 22) == 22, "False ternary branch failed");
std::assert((true ? (false ? 1 : 2) : 3) == 2, "Nested ternary failed");
std::assert(((3 < 4) ? 8 : 9) == 8, "Comparison ternary failed");

// Bitwise operations
std::assert((0xF0 & 0xCC) == 0xC0, "Bitwise and failed");
std::assert((0xF0 | 0x0F) == 0xFF, "Bitwise or failed");
std::assert((0xAA ^ 0xFF) == 0x55, "Bitwise xor failed");
std::assert((1 << 0) == 1, "Zero left shift failed");
std::assert((1 << 7) == 128, "Left shift failed");
std::assert((0x80 >> 7) == 1, "Right shift failed");
std::assert(((0xF0 & 0xCC) | 0x03) == 0xC3, "Combined bitwise expression failed");
std::assert(u8(~0x0F) == 0xF0, "Narrowed bitwise not failed");

// Casts and narrowing
std::assert(u8(0x123) == 0x23, "u8 narrowing failed");
std::assert(u16(0x12345) == 0x2345, "u16 narrowing failed");
std::assert(u32(-1) == 0xFFFFFFFF, "Signed-to-u32 cast failed");
std::assert(s8(0x7F) == 127, "Positive s8 cast failed");
std::assert(s8(0xFF) == -1, "Negative s8 cast failed");
std::assert(s16(0xFFFF) == -1, "Negative s16 cast failed");
std::assert(bool(0) == false, "Zero-to-bool cast failed");
std::assert(bool(42) == true, "Integer-to-bool cast failed");
std::assert(u32(3.9) == 3, "Float-to-integer cast failed");
std::assert(double(3) == 3.0D, "Integer-to-double cast failed");

// Compound assignments
u32 compound = 10;
compound += 5;
std::assert(compound == 15, "Addition assignment failed");
compound -= 3;
std::assert(compound == 12, "Subtraction assignment failed");
compound *= 4;
std::assert(compound == 48, "Multiplication assignment failed");
compound /= 6;
std::assert(compound == 8, "Division assignment failed");
compound %= 3;
std::assert(compound == 2, "Modulo assignment failed");
compound <<= 4;
std::assert(compound == 32, "Left-shift assignment failed");
compound >>= 2;
std::assert(compound == 8, "Right-shift assignment failed");
compound |= 3;
std::assert(compound == 11, "Bitwise-or assignment failed");
compound &= 6;
std::assert(compound == 2, "Bitwise-and assignment failed");
compound ^= 7;
std::assert(compound == 5, "Bitwise-xor assignment failed");
