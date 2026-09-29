std::assert(sizeof(u8) == 1, "sizeof(u8) failed");
std::assert(sizeof(s8) == 1, "sizeof(s8) failed");
std::assert(sizeof(u16) == 2, "sizeof(u16) failed");
std::assert(sizeof(s16) == 2, "sizeof(s16) failed");
std::assert(sizeof(u24) == 3, "sizeof(u24) failed");
std::assert(sizeof(s24) == 3, "sizeof(s24) failed");
std::assert(sizeof(u32) == 4, "sizeof(u32) failed");
std::assert(sizeof(s32) == 4, "sizeof(s32) failed");
std::assert(sizeof(u48) == 6, "sizeof(u48) failed");
std::assert(sizeof(s48) == 6, "sizeof(s48) failed");
std::assert(sizeof(u64) == 8, "sizeof(u64) failed");
std::assert(sizeof(s64) == 8, "sizeof(s64) failed");
std::assert(sizeof(u96) == 12, "sizeof(u96) failed");
std::assert(sizeof(s96) == 12, "sizeof(s96) failed");
std::assert(sizeof(u128) == 16, "sizeof(u128) failed");
std::assert(sizeof(s128) == 16, "sizeof(s128) failed");
std::assert(sizeof(char) == 1, "sizeof(char) failed");
std::assert(sizeof(char16) == 2, "sizeof(char16) failed");
std::assert(sizeof(bool) == 1, "sizeof(bool) failed");
std::assert(sizeof(float) == 4, "sizeof(float) failed");
std::assert(sizeof(double) == 8, "sizeof(double) failed");

std::assert(typenameof(u8) == "u8", "typenameof(u8) failed");
std::assert(typenameof(s8) == "s8", "typenameof(s8) failed");
std::assert(typenameof(u16) == "u16", "typenameof(u16) failed");
std::assert(typenameof(s16) == "s16", "typenameof(s16) failed");
std::assert(typenameof(u24) == "u24", "typenameof(u24) failed");
std::assert(typenameof(s24) == "s24", "typenameof(s24) failed");
std::assert(typenameof(u32) == "u32", "typenameof(u32) failed");
std::assert(typenameof(s32) == "s32", "typenameof(s32) failed");
std::assert(typenameof(u48) == "u48", "typenameof(u48) failed");
std::assert(typenameof(s48) == "s48", "typenameof(s48) failed");
std::assert(typenameof(u64) == "u64", "typenameof(u64) failed");
std::assert(typenameof(s64) == "s64", "typenameof(s64) failed");
std::assert(typenameof(u96) == "u96", "typenameof(u96) failed");
std::assert(typenameof(s96) == "s96", "typenameof(s96) failed");
std::assert(typenameof(u128) == "u128", "typenameof(u128) failed");
std::assert(typenameof(s128) == "s128", "typenameof(s128) failed");
std::assert(typenameof(char) == "char", "typenameof(char) failed");
std::assert(typenameof(char16) == "char16", "typenameof(char16) failed");
std::assert(typenameof(bool) == "bool", "typenameof(bool) failed");
std::assert(typenameof(float) == "float", "typenameof(float) failed");
std::assert(typenameof(double) == "double", "typenameof(double) failed");

struct TypeOperatorStruct {
    u8 first;
    u16 second;
    u32 third;
};

union TypeOperatorUnion {
    u8 small;
    u64 large;
};

enum TypeOperatorEnum : u16 { A, B };

std::assert(sizeof(TypeOperatorStruct) == 7, "Custom struct type size failed");
std::assert(sizeof(TypeOperatorUnion) == 8, "Custom union type size failed");
std::assert(sizeof(TypeOperatorEnum) == 2, "Custom enum type size failed");
std::assert(typenameof(TypeOperatorStruct) == "TypeOperatorStruct", "Custom struct type name failed");
std::assert(typenameof(TypeOperatorUnion) == "TypeOperatorUnion", "Custom union type name failed");
std::assert(typenameof(TypeOperatorEnum) == "TypeOperatorEnum", "Custom enum type name failed");

TypeOperatorStruct typeOperatorValue;
std::assert(sizeof(typeOperatorValue) == 7, "Struct value size failed");
std::assert(typenameof(typeOperatorValue) == "TypeOperatorStruct", "Struct value type name failed");
