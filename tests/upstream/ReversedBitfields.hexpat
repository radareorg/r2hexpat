#pragma endian big

enum Enum : u8 {
    A = 0x39,
};

bitfield Test {
    bool flag0 : 1;
    bool flag1 : 1;
    bool flag2 : 1;
    bool flag3 : 1;
    bool flag4 : 1;
    bool flag5 : 1;
    Enum enumerated : 6;
} [[bitfield_order(1, 16)]];

Test test @ 2;

std::assert(test.flag0 == true, "flag0 was invalid");
std::assert(test.flag1 == true, "flag1 was invalid");
std::assert(test.flag2 == true, "flag2 was invalid");
std::assert(test.flag3 == false, "flag3 was invalid");
std::assert(test.flag4 == false, "flag4 was invalid");
std::assert(test.flag5 == false, "flag5 was invalid");
std::assert(test.enumerated == Enum::A, "enumerated was invalid");
