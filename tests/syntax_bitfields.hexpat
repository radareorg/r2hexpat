// Bitfields: little/big endian bit order, signed and bool fields, enums
enum Mode : u8 { Off, On, Auto };
bitfield Flags {
    lo : 3;
    bool set : 1;
    signed mid : 4;
    Mode mode : 2;
    padding : 6;
};
Flags le_flags @ 0x00;
be Flags be_flags @ 0x00;
std::print("lo={} set={} mid={} mode={}", le_flags.lo, le_flags.set, le_flags.mid, le_flags.mode);
