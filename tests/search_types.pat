#include "../demo/player.hexpat"
bitfield Bits { low : 3; bool enabled : 1; signed high : 4; };
struct Dynamic { u8 length; u8 payload[length]; };
struct Text { char name[8]; u16 code; };
struct Array<T, auto N> { T values[N]; };
// Type-only loading must neither read this placement nor run the assertion.
Player impossible @ 0x100000;
std::assert(false, "search commands must not execute top-level statements");
