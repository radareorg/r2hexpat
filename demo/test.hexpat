/* Mach-O header pattern (macOS /bin/ls) */
struct MachHeader {
    u32 magic;       // 0xfeedfacf = MH_MAGIC_64
    u32 cputype;     // 0x0100000c = ARM64
    u32 cpusubtype;
    u32 filetype;
    u32 ncmds;
    u32 sizeofcmds;
    u32 flags;
    u32 reserved;
};
MachHeader macho @ 0x0;

u32 someflags[2] @ 0x20;
