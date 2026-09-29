#define MSG "Unicode escape failed"

// \u and \U give a code point, encoded as UTF-8. \x gives one
// byte. The two are only the same below U+0080.
std::assert("\u0041" == "A", MSG);
std::assert("\u0041" == "\x41", MSG);

// Two bytes above U+007F. Before, \u kept the low byte only.
std::assert("\u00E9" == "\xC3\xA9", MSG);
std::assert("\u00E9" != "\xE9", MSG);

// Three bytes. The high byte of the code point must survive.
std::assert("\u20AC" == "\xE2\x82\xAC", MSG);
std::assert("\u20AC" != "\xAC", MSG);

// The last code point \u can reach.
std::assert("\uFFFD" == "\xEF\xBF\xBD", MSG);

// \U reads eight digits and reaches past U+FFFF.
std::assert("\U00000041" == "A", MSG);
std::assert("\U000000E9" == "\xC3\xA9", MSG);
std::assert("\U0001F600" == "\xF0\x9F\x98\x80", MSG);
std::assert("\U0010FFFF" == "\xF4\x8F\xBF\xBF", MSG);

// An escape joins the text around it.
std::assert("caf\u00E9" == "caf\xC3\xA9", MSG);
std::assert("\u00E9\u00E9" == "\xC3\xA9\xC3\xA9", MSG);

// A literal character in the source needs no escape.
std::assert("café" == "caf\u00E9", MSG);

// Lower case digits read the same as upper case ones.
std::assert("\u00e9" == "\u00E9", MSG);
std::assert("\xc3" == "\xC3", MSG);
std::assert("\U0001f600" == "\U0001F600", MSG);

// The other escapes still give one byte each.
std::assert("\n" == "\x0A", MSG);
std::assert("\t" == "\x09", MSG);
std::assert("\r" == "\x0D", MSG);
std::assert("\a" == "\x07", MSG);
std::assert("\b" == "\x08", MSG);
std::assert("\f" == "\x0C", MSG);
std::assert("\0" == "\x00", MSG);
std::assert("\'" == "\x27", MSG);
std::assert("\\" == "\x5C", MSG);
std::assert("\"" == "\x22", MSG);

// A char still holds one byte.
std::assert('A' == 0x41, MSG);
std::assert('\x41' == 0x41, MSG);
std::assert('\u0041' == 0x41, MSG);
std::assert('\n' == 0x0A, MSG);
