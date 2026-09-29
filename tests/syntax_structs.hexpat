// Structs, nested structs, unions
struct Header {
    u32 magic;
    u16 version;
    u16 flags;
    u64 timestamp;
};
union Word {
    u32 value;
    u8 bytes[4];
};
struct File {
    Header head;
    Word word;
    u8 len;
    u8 data[len % 4];
};
File file @ 0x00;
u32 footer @ $;
