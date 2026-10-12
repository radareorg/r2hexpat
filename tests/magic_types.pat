#include "test.hexpat"
enum Mode : u8 { Off, On };
struct Pair { be u16 value; };
union Value { u32 word; u8 bytes[4]; };
struct Header {
  char magic[4];
  u16 version;
  be u16 flags;
  u64 timestamp;
  Pair pairs[2];
  Value value;
  float ratio;
  Mode mode;
  s16 delta;
  padding[1];
  Header *next : u32;
  be char16 name[2];
};
struct Wide { u24 value; };
struct Dynamic { u8 count; u8 values[count]; };
// Exporting types must not decode the included MachHeader or execute assertions.
std::assert(false, "magic commands must not execute top-level statements");
