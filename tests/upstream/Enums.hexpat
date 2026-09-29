enum TestEnum : u32 {
    A,
    B = 0x0C,
    C,
    D,
    E = 0xAA ... 0xBB
};

be TestEnum testEnum @ 0x08;

std::assert(testEnum == TestEnum::C, "Invalid enum value");

enum SignedEnum : s8 {
    unknown = -1,
    fe = 0xfe,
};

fn test_signed_enum_format() {
    SignedEnum value = -1;
    std::assert(builtin::std::format("{}", value) == "SignedEnum::unknown", "Invalid signed enum value name");
};

test_signed_enum_format();
