// Strings: null-terminated char arrays, escaping in the dump, str locals
char s1[] @ 0x00;
u8 after_s1 @ $;
char raw[4] @ 0x00;
str greeting = "hello" + ' ' + "world" * 2;
std::print("{} ({} bytes)", greeting, std::string::length(greeting));
