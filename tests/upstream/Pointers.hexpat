u32 *placementPointer : u8 @ 0x0C;
u32 *pointerToArray[10] : u8 @ $;

fn Rel(u128) { return 0x1D; };
u32 *pointerRelativeSigned : s8 @ 0x1D [[pointer_base("Rel")]];
