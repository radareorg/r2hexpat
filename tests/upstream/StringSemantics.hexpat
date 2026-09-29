std::assert("" == "", "Empty string equality failed");
std::assert("abc" == "abc", "String equality failed");
std::assert("abc" != "abd", "String inequality failed");
std::assert("abc" < "abd", "String less-than failed");
std::assert("abd" > "abc", "String greater-than failed");
std::assert("abc" <= "abc", "String less-than-or-equal failed");
std::assert("abc" >= "abc", "String greater-than-or-equal failed");
std::assert("hello" + " world" == "hello world", "String concatenation failed");
std::assert("A" + 'B' == "AB", "String and character concatenation failed");
std::assert('A' + "BC" == "ABC", "Character and string concatenation failed");
std::assert("ab" * 0 == "", "Zero string repetition failed");
std::assert("ab" * 1 == "ab", "Single string repetition failed");
std::assert("ab" * 3 == "ababab", "String repetition failed");

str escaped = "line1\nline2\tend";
std::assert(escaped == "line1\nline2\tend", "Escaped string storage failed");
std::assert("\"quoted\"" == "\x22quoted\x22", "Hex escape equality failed");
std::assert("\\" == "\x5C", "Backslash escape failed");

str left = "left";
str right = "right";
str combined = left + ":" + right;
std::assert(left == "left", "String concatenation changed left operand");
std::assert(right == "right", "String concatenation changed right operand");
std::assert(combined == "left:right", "String variable concatenation failed");

str copied = combined;
combined = "changed";
std::assert(copied == "left:right", "String copy aliased source");
std::assert(combined == "changed", "String reassignment failed");

fn decorate(auto value) {
    return "[" + value + "]";
};

std::assert(decorate("") == "[]", "Empty string function argument failed");
std::assert(decorate("value") == "[value]", "String function return failed");

std::assert(builtin::std::format("{}", 42) == "42", "Integer formatting failed");
std::assert(builtin::std::format("{}", -42) == "-42", "Signed integer formatting failed");
std::assert(builtin::std::format("{}", "text") == "text", "String formatting failed");
std::assert(builtin::std::format("{}:{}", "key", 7) == "key:7", "Multi-argument formatting failed");
std::assert(builtin::std::format("{{{}}}", 9) == "{9}", "Escaped brace formatting failed");
