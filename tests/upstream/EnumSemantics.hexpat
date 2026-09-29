enum Direction : u8 {
    North,
    East,
    South = 5,
    West,
};

std::assert(Direction::North == 0, "Implicit first enum value failed");
std::assert(Direction::East == 1, "Implicit second enum value failed");
std::assert(Direction::South == 5, "Explicit enum value failed");
std::assert(Direction::West == 6, "Implicit value after explicit value failed");
std::assert(Direction::North != Direction::East, "Enum inequality failed");
std::assert(Direction::West > Direction::South, "Enum ordering failed");

Direction direction = Direction::North;
std::assert(direction == Direction::North, "Local enum initialization failed");
direction = Direction::West;
std::assert(direction == Direction::West, "Local enum assignment failed");
std::assert(u8(direction) == 6, "Enum-to-integer cast failed");
std::assert(builtin::std::format("{}", direction) == "Direction::West", "Enum formatting failed");

enum SignedCode : s8 {
    Minimum = -128,
    Negative = -2,
    MinusOne,
    Zero,
    Positive = 127,
};

std::assert(SignedCode::Minimum == -128, "Minimum signed enum value failed");
std::assert(SignedCode::Negative == -2, "Negative signed enum value failed");
std::assert(SignedCode::MinusOne == -1, "Incremented negative enum value failed");
std::assert(SignedCode::Zero == 0, "Incremented zero enum value failed");
std::assert(SignedCode::Positive == 127, "Maximum signed enum value failed");

SignedCode signedCode = SignedCode::MinusOne;
std::assert(builtin::std::format("{}", signedCode) == "SignedCode::MinusOne", "Negative enum formatting failed");

enum RangeCode : u8 {
    Low = 0 ... 9,
    Medium = 10 ... 19,
    High = 20 ... 29,
};

RangeCode rangeCode = 0;
std::assert(builtin::std::format("{}", rangeCode) == "RangeCode::Low", "Range enum lower bound failed");
rangeCode = 9;
std::assert(builtin::std::format("{}", rangeCode) == "RangeCode::Low", "Range enum upper bound failed");
rangeCode = 10;
std::assert(builtin::std::format("{}", rangeCode) == "RangeCode::Medium", "Second range lower bound failed");
rangeCode = 19;
std::assert(builtin::std::format("{}", rangeCode) == "RangeCode::Medium", "Second range upper bound failed");
rangeCode = 25;
std::assert(builtin::std::format("{}", rangeCode) == "RangeCode::High", "Range enum middle value failed");
std::assert(builtin::std::format("{}", rangeCode) == "RangeCode::High", "Range enum formatting failed");

enum Flags : u8 {
    Read = 1,
    Write = 2,
    Execute = 4,
};

std::assert((u8(Flags::Read) | u8(Flags::Write)) == 3, "Enum bitwise combination failed");
std::assert((u8(Flags::Execute) & 4) == 4, "Enum bitwise mask failed");
