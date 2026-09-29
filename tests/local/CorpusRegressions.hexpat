// Regressions for semantics found by running the ImHex-Patterns corpus.
// Data: tests/upstream/test_data.bin (a PNG: 89 50 4E 47 0D 0A 1A 0A ...)

// bitwise operators bind tighter than comparisons
std::assert((0x80 & 0x80 != 0) == true, "& must bind tighter than !=");
std::assert(1 | 2 == 3, "| must bind tighter than ==");

// float literal without fraction digits, endian casts
std::assert(1.F == 1.0, "1.F literal");
std::assert(be u16(0x1234) == 0x3412, "be cast swaps bytes");
std::assert(le u16(0x1234) == 0x1234, "le cast keeps bytes");

// scope operator with spaces, ternary in template arguments
enum Color : u8 { Red, Green };
std::assert(Color:: Green == 1, "spaced scope operator");
struct Box<auto N> { u8 data[N]; };
Box<true ? 2 : 3> box @ 0;
std::assert(sizeof(box) == 2, "ternary template argument");

// logical operators inside match cases
fn m(auto v) { match (v) { (1 || 3): return "a"; (_): return "b"; } };
std::assert(m(1) == "a", "match on a logical expression");

// char arrays keep NUL bytes; transform/format functions and decay
struct Magic<auto Expected> {
    char value[std::string::length(Expected)];
    std::assert(value == Expected, "magic mismatch");
};
Magic<"\x89PNG\r\n\x1A\n"> magic @ 0;

struct Wrapped { u8 v; } [[transform("unwrap"), format("fmt_wrapped")]];
fn unwrap(auto w) { return w.v; };
fn fmt_wrapped(auto w) { return std::format("W{}", w); };
Wrapped wrapped @ 0;
std::assert(wrapped == 0x89, "transform returning a member decays");
std::assert(std::format("{}", wrapped) == "137", "formatting a transformed pattern uses its value");

// type attributes see the members; [[name]] is a display name
struct Named { u8 first; } [[name(std::format("n{}", first))]];
Named named @ 1;
std::assert(named.first == 0x50, "member still reachable after [[name]]");

// `auto` locals are members, enum constants through aliases, custom enum underlying types
using ColorAlias = Color;
struct Holder { auto answer = 42; u8 c = ColorAlias::Green; };
Holder holder @ 0;
std::assert(holder.answer == 42 && holder.c == 1, "auto member and aliased enum constant");
struct Byte { u8 raw; } [[transform("byte_value")]];
fn byte_value(auto b) { return b.raw; };
enum Kind : Byte { A = 0x89 };
Kind kind @ 0;
std::assert(kind == Kind::A, "enum over a transformed type");

// bitfield fields with no_unique_address overlap
bitfield Frame { bool flag : 1 [[no_unique_address]]; addr : 8; };
Frame frame @ 0;
std::assert(frame.flag == true && frame.addr == 0x89, "overlapping bitfield field");

// break in an array entry ends the array, continue drops the entry, array_index works
struct UntilZero { u8 b; if (b == 0) break; };
UntilZero bytes[16] @ 4;
std::assert(std::core::member_count(bytes) == 5, "break ends the array");
struct OnlyOdd { u8 b; if (std::core::array_index() % 2 == 0) continue; };
OnlyOdd odd[4] @ 0;
std::assert(std::core::member_count(odd) == 2, "continue drops entries");
