struct Inner { be u16 word; } [[color("00FF00")]];
struct Header {
    u8 count [[color("FF0000"), comment("entry count")]];
    Inner inner [[name("Details")]];
    u8 data[count % 3];
} [[color("1144AA")]];
std::assert(false, "tree commands must not execute top-level statements");
fn main() { std::assert(false, "tree commands must not run main()"); };
