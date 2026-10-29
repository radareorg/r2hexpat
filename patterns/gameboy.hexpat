// Game Boy / Game Boy Color cartridge and CPU memory layouts.
// Reference: https://gbdev.io/pandocs/ (CC0 hardware documentation).
// Header: https://gbdev.io/pandocs/The_Cartridge_Header.html
// I/O: https://gbdev.io/pandocs/Hardware_Reg_List.html
// Memory: https://gbdev.io/pandocs/Memory_Map.html
// Mappers: https://gbdev.io/pandocs/MBCs.html
// Plugin: https://github.com/radareorg/r2hexpat
// ROM: r2 -q -c 'hexpat gameboy.hexpat' game.gb
// Apply flags, data hints and comments: .hexpat* gameboy.hexpat
// JSON: hexpatj gameboy.hexpat
// Set GB_CPU_MEMORY to 1 ONLY for a flat 64 KiB CPU address-space dump.
// A ROM file's offsets above 0x7FFF are more ROM banks, not CPU RAM or I/O.
// CPU dumps expose only the currently selected ROM/VRAM/WRAM/cartridge bank.
// This maps data; it does not emulate devices or reconstruct bank state.

#pragma endian little
#pragma base_address 0

#define GB_CPU_MEMORY 0

// Bitfields below run from least significant bit to most significant bit.
// CGB flag bit 7 enables color mode; 0xC0 conventionally means CGB-only.
// 0x00 requests DMG compatibility. 0xCE and 0xC3 are NOT DMG/CGB markers.
enum CgbFlag : u8 {
	DmgCompatible = 0x00 ... 0x7F,
	CgbEnhanced = 0x80,
	CgbOnly = 0xC0
};

enum SgbFlag : u8 {
	NoSgb = 0x00,
	SgbSupported = 0x03
};

enum CartridgeType : u8 {
	RomOnly = 0x00,
	Mbc1 = 0x01,
	Mbc1Ram = 0x02,
	Mbc1RamBattery = 0x03,
	Mbc2 = 0x05,
	Mbc2Battery = 0x06,
	RomRam = 0x08,
	RomRamBattery = 0x09,
	Mmm01 = 0x0B,
	Mmm01Ram = 0x0C,
	Mmm01RamBattery = 0x0D,
	Mbc3TimerBattery = 0x0F,
	Mbc3TimerRamBattery = 0x10,
	Mbc3 = 0x11,
	Mbc3Ram = 0x12,
	Mbc3RamBattery = 0x13,
	Mbc5 = 0x19,
	Mbc5Ram = 0x1A,
	Mbc5RamBattery = 0x1B,
	Mbc5Rumble = 0x1C,
	Mbc5RumbleRam = 0x1D,
	Mbc5RumbleRamBattery = 0x1E,
	Mbc6 = 0x20,
	Mbc7SensorRumbleRamBattery = 0x22,
	PocketCamera = 0xFC,
	BandaiTama5 = 0xFD,
	HuC3 = 0xFE,
	HuC1RamBattery = 0xFF
};

enum RomSize : u8 {
	KiB32_Banks2 = 0x00,
	KiB64_Banks4 = 0x01,
	KiB128_Banks8 = 0x02,
	KiB256_Banks16 = 0x03,
	KiB512_Banks32 = 0x04,
	MiB1_Banks64 = 0x05,
	MiB2_Banks128 = 0x06,
	MiB4_Banks256 = 0x07,
	MiB8_Banks512 = 0x08,
	Unofficial_Banks72 = 0x52,
	Unofficial_Banks80 = 0x53,
	Unofficial_Banks96 = 0x54
};

// 0x01 is a legacy unofficial 2 KiB code, unused by licensed cartridges.
// MBC2 has 512 four-bit RAM cells despite its header RAM size being zero.
enum RamSize : u8 {
	None = 0x00,
	Unused_LegacyKiB2 = 0x01,
	KiB8_Banks1 = 0x02,
	KiB32_Banks4 = 0x03,
	KiB128_Banks16 = 0x04,
	KiB64_Banks8 = 0x05
};

enum Destination : u8 {
	Japan = 0x00,
	Overseas = 0x01
};

// New codes are two ASCII bytes; read this enum big-endian.
enum NewLicenseeCode : u16 {
	None_00 = 0x3030,
	Nintendo_Research_Development_1_01 = 0x3031,
	Capcom_08 = 0x3038,
	EA_Electronic_Arts_13 = 0x3133,
	Hudson_Soft_18 = 0x3138,
	B_AI_19 = 0x3139,
	KSS_20 = 0x3230,
	Planning_Office_WADA_22 = 0x3232,
	PCM_Complete_24 = 0x3234,
	San_X_25 = 0x3235,
	Kemco_28 = 0x3238,
	SETA_Corporation_29 = 0x3239,
	Viacom_30 = 0x3330,
	Nintendo_31 = 0x3331,
	Bandai_32 = 0x3332,
	Ocean_Software_Acclaim_Entertainment_33 = 0x3333,
	Konami_34 = 0x3334,
	HectorSoft_35 = 0x3335,
	Taito_37 = 0x3337,
	Hudson_Soft_38 = 0x3338,
	Banpresto_39 = 0x3339,
	Ubi_Soft_41 = 0x3431,
	Atlus_42 = 0x3432,
	Malibu_Interactive_44 = 0x3434,
	Angel_46 = 0x3436,
	Bullet_Proof_Software_47 = 0x3437,
	Irem_49 = 0x3439,
	Absolute_50 = 0x3530,
	Acclaim_Entertainment_51 = 0x3531,
	Activision_52 = 0x3532,
	Sammy_USA_Corporation_53 = 0x3533,
	Konami_54 = 0x3534,
	Hi_Tech_Expressions_55 = 0x3535,
	LJN_56 = 0x3536,
	Matchbox_57 = 0x3537,
	Mattel_58 = 0x3538,
	Milton_Bradley_Company_59 = 0x3539,
	Titus_Interactive_60 = 0x3630,
	Virgin_Games_Ltd_61 = 0x3631,
	Lucasfilm_Games_64 = 0x3634,
	Ocean_Software_67 = 0x3637,
	EA_Electronic_Arts_69 = 0x3639,
	Infogrames_70 = 0x3730,
	Interplay_Entertainment_71 = 0x3731,
	Broderbund_72 = 0x3732,
	Sculptured_Software_73 = 0x3733,
	The_Sales_Curve_Limited_75 = 0x3735,
	THQ_78 = 0x3738,
	Accolade_79 = 0x3739,
	Misawa_Entertainment_80 = 0x3830,
	LOZC_G_83 = 0x3833,
	Tokuma_Shoten_86 = 0x3836,
	Tsukuda_Original_87 = 0x3837,
	Chunsoft_Co_91 = 0x3931,
	Video_System_92 = 0x3932,
	Ocean_Software_Acclaim_Entertainment_93 = 0x3933,
	Varie_95 = 0x3935,
	Yonezawa_S_Pal_96 = 0x3936,
	Kaneko_97 = 0x3937,
	Pack_In_Video_99 = 0x3939,
	Bottom_Up_9H = 0x3948,
	Konami_Yu_Gi_Oh_A4 = 0x4134,
	MTO_BL = 0x424C,
	Kodansha_DK = 0x444B
};

enum OldLicenseeCode : u8 {
	None_00 = 0x00,
	Nintendo_01 = 0x01,
	Capcom_08 = 0x08,
	HOT_B_09 = 0x09,
	Jaleco_0A = 0x0A,
	Coconuts_Japan_0B = 0x0B,
	Elite_Systems_0C = 0x0C,
	EA_Electronic_Arts_13 = 0x13,
	Hudson_Soft_18 = 0x18,
	ITC_Entertainment_19 = 0x19,
	Yanoman_1A = 0x1A,
	Japan_Clary_1D = 0x1D,
	Virgin_Games_Ltd_1F = 0x1F,
	PCM_Complete_24 = 0x24,
	San_X_25 = 0x25,
	Kemco_28 = 0x28,
	SETA_Corporation_29 = 0x29,
	Infogrames_30 = 0x30,
	Nintendo_31 = 0x31,
	Bandai_32 = 0x32,
	UseNewLicensee_33 = 0x33,
	Konami_34 = 0x34,
	HectorSoft_35 = 0x35,
	Capcom_38 = 0x38,
	Banpresto_39 = 0x39,
	Entertainment_Interactive_3C = 0x3C,
	Gremlin_3E = 0x3E,
	Ubi_Soft_41 = 0x41,
	Atlus_42 = 0x42,
	Malibu_Interactive_44 = 0x44,
	Angel_46 = 0x46,
	Spectrum_HoloByte_47 = 0x47,
	Irem_49 = 0x49,
	Virgin_Games_Ltd_4A = 0x4A,
	Malibu_Interactive_4D = 0x4D,
	U_S_Gold_4F = 0x4F,
	Absolute_50 = 0x50,
	Acclaim_Entertainment_51 = 0x51,
	Activision_52 = 0x52,
	Sammy_USA_Corporation_53 = 0x53,
	GameTek_54 = 0x54,
	Park_Place_55 = 0x55,
	LJN_56 = 0x56,
	Matchbox_57 = 0x57,
	Milton_Bradley_Company_59 = 0x59,
	Mindscape_5A = 0x5A,
	Romstar_5B = 0x5B,
	Naxat_Soft_5C = 0x5C,
	Tradewest_5D = 0x5D,
	Titus_Interactive_60 = 0x60,
	Virgin_Games_Ltd_61 = 0x61,
	Ocean_Software_67 = 0x67,
	EA_Electronic_Arts_69 = 0x69,
	Elite_Systems_6E = 0x6E,
	Electro_Brain_6F = 0x6F,
	Infogrames_70 = 0x70,
	Interplay_Entertainment_71 = 0x71,
	Broderbund_72 = 0x72,
	Sculptured_Software_73 = 0x73,
	The_Sales_Curve_Limited_75 = 0x75,
	THQ_78 = 0x78,
	Accolade_79 = 0x79,
	Triffix_Entertainment_7A = 0x7A,
	MicroProse_7C = 0x7C,
	Kemco_7F = 0x7F,
	Misawa_Entertainment_80 = 0x80,
	LOZC_G_83 = 0x83,
	Tokuma_Shoten_86 = 0x86,
	Bullet_Proof_Software_8B = 0x8B,
	Vic_Tokai_Corp_8C = 0x8C,
	Ape_Inc_8E = 0x8E,
	I_Max_8F = 0x8F,
	Chunsoft_Co_91 = 0x91,
	Video_System_92 = 0x92,
	Tsubaraya_Productions_93 = 0x93,
	Varie_95 = 0x95,
	Yonezawa_S_Pal_96 = 0x96,
	Kemco_97 = 0x97,
	Arc_99 = 0x99,
	Nihon_Bussan_9A = 0x9A,
	Tecmo_9B = 0x9B,
	Imagineer_9C = 0x9C,
	Banpresto_9D = 0x9D,
	Nova_9F = 0x9F,
	Hori_Electric_A1 = 0xA1,
	Bandai_A2 = 0xA2,
	Konami_A4 = 0xA4,
	Kawada_A6 = 0xA6,
	Takara_A7 = 0xA7,
	Technos_Japan_A9 = 0xA9,
	Broderbund_AA = 0xAA,
	Toei_Animation_AC = 0xAC,
	Toho_AD = 0xAD,
	Namco_AF = 0xAF,
	Acclaim_Entertainment_B0 = 0xB0,
	ASCII_Corporation_or_Nexsoft_B1 = 0xB1,
	Bandai_B2 = 0xB2,
	Square_Enix_B4 = 0xB4,
	HAL_Laboratory_B6 = 0xB6,
	SNK_B7 = 0xB7,
	Pony_Canyon_B9 = 0xB9,
	Culture_Brain_BA = 0xBA,
	Sunsoft_BB = 0xBB,
	Sony_Imagesoft_BD = 0xBD,
	Sammy_Corporation_BF = 0xBF,
	Taito_C0 = 0xC0,
	Kemco_C2 = 0xC2,
	Square_C3 = 0xC3,
	Tokuma_Shoten_C4 = 0xC4,
	Data_East_C5 = 0xC5,
	Tonkin_House_C6 = 0xC6,
	Koei_C8 = 0xC8,
	UFL_C9 = 0xC9,
	Ultra_Games_CA = 0xCA,
	VAP_Inc_CB = 0xCB,
	Use_Corporation_CC = 0xCC,
	Meldac_CD = 0xCD,
	Pony_Canyon_CE = 0xCE,
	Angel_CF = 0xCF,
	Taito_D0 = 0xD0,
	SOFEL_Software_Engineering_Lab_D1 = 0xD1,
	Quest_D2 = 0xD2,
	Sigma_Enterprises_D3 = 0xD3,
	ASK_Kodansha_Co_D4 = 0xD4,
	Naxat_Soft_D6 = 0xD6,
	Copya_System_D7 = 0xD7,
	Banpresto_D9 = 0xD9,
	Tomy_DA = 0xDA,
	LJN_DB = 0xDB,
	Nippon_Computer_Systems_DD = 0xDD,
	Human_Ent_DE = 0xDE,
	Altron_DF = 0xDF,
	Jaleco_E0 = 0xE0,
	Towa_Chiki_E1 = 0xE1,
	Yutaka_E2 = 0xE2,
	Varie_E3 = 0xE3,
	Epoch_E5 = 0xE5,
	Athena_E7 = 0xE7,
	Asmik_Ace_Entertainment_E8 = 0xE8,
	Natsume_E9 = 0xE9,
	King_Records_EA = 0xEA,
	Atlus_EB = 0xEB,
	Epic_Sony_Records_EC = 0xEC,
	IGS_EE = 0xEE,
	A_Wave_F0 = 0xF0,
	Extreme_Entertainment_F3 = 0xF3
};

// All three title layouts occupy the same 16 bytes; no reliable auto-detection.
struct CgbTitle {
	char text[15];
	CgbFlag cgb_flag;
};

struct ManufacturerTitle {
	char text[11];
	char manufacturer_code[4];
	CgbFlag cgb_flag;
};

union CartridgeTitle {
	char dmg_text[16];
	CgbTitle cgb;
	ManufacturerTitle manufacturer;
};

union NewLicensee {
	char ascii[2];
	be NewLicenseeCode publisher;
};

struct GameBoyHeader {
	u8 entry_point_code[4];             // 0100: instructions, not an integer pointer.
	u8 nintendo_logo[48];               // 0104: boot logo, ends at 0133.
	CartridgeTitle title;               // 0134: overlapping DMG/CGB title layouts.
	NewLicensee new_licensee;           // 0144: used only when old_licensee == 0x33.
	SgbFlag sgb_flag;                   // 0146: SGB also requires old_licensee 0x33.
	CartridgeType cartridge_type;       // 0147.
	RomSize rom_size;                   // 0148.
	RamSize ram_size;                   // 0149.
	Destination destination;           // 014A.
	OldLicenseeCode old_licensee;       // 014B.
	u8 rom_version;                    // 014C.
	u8 header_checksum;                // 014D: subtract each byte 0134..014C plus 1.
	be u16 global_checksum;            // 014E: sum ROM bytes excluding 014E..014F.
};

// These slots contain code, not address pointers; unused vectors may hold data.
struct GameBoyVectors {
	u8 rst_00[8];
	u8 rst_08[8];
	u8 rst_10[8];
	u8 rst_18[8];
	u8 rst_20[8];
	u8 rst_28[8];
	u8 rst_30[8];
	u8 rst_38[8];
	u8 interrupt_vblank_40[8];
	u8 interrupt_lcd_stat_48[8];
	u8 interrupt_timer_50[8];
	u8 interrupt_serial_58[8];
	u8 interrupt_joypad_60[8];
};

// Register layouts describe bit positions, not read/write side effects.
// Unused bits often read as 1; write-only bits cannot be recovered from a dump.
enum TimerClock : u8 {
	Hz4096 = 0,
	Hz262144 = 1,
	Hz65536 = 2,
	Hz16384 = 3
};

enum PpuMode : u8 {
	HBlank = 0,
	VBlank = 1,
	OamScan = 2,
	Drawing = 3
};

enum DmgShade : u8 {
	White = 0,
	LightGray = 1,
	DarkGray = 2,
	Black = 3
};

enum DutyCycle : u8 {
	Percent12_5 = 0,
	Percent25 = 1,
	Percent50 = 2,
	Percent75 = 3
};

enum WaveLevel : u8 {
	Mute = 0,
	Full = 1,
	Half = 2,
	Quarter = 3
};

bitfield Joypad {
	a_or_right_released : 1;
	b_or_left_released : 1;
	select_or_up_released : 1;
	start_or_down_released : 1;
	dpad_deselected : 1;                // 0 selects directions.
	buttons_deselected : 1;             // 0 selects buttons; all inputs active-low.
	padding : 2;
};

bitfield SerialControl {
	internal_clock : 1;
	cgb_fast_clock : 1;
	padding : 5;
	transfer_requested : 1;
};

bitfield TimerControl {
	TimerClock clock : 2;               // Normal-speed rates; double on CGB double speed.
	enabled : 1;
	padding : 5;
};

bitfield Interrupts {
	vblank : 1;
	lcd_stat : 1;
	timer : 1;
	serial : 1;
	joypad : 1;
	padding : 3;
};

bitfield AudioSweep {
	shift : 3;
	subtract : 1;
	pace : 3;
	padding : 1;
};

bitfield AudioDutyLength {
	initial_length_timer : 6;           // Length = 64 - value; write-only portion.
	DutyCycle duty : 2;
};

bitfield AudioEnvelope {
	pace : 3;
	increase : 1;
	initial_volume : 4;
};

bitfield AudioPeriodHigh {
	period_high : 3;
	padding : 3;
	length_enabled : 1;
	trigger : 1;                       // Write 1 to trigger; not a readable state bit.
};

bitfield WaveDac {
	padding : 7;
	enabled : 1;
};

bitfield WaveOutputLevel {
	padding : 5;
	WaveLevel level : 2;
	padding : 1;
};

bitfield NoiseLength {
	initial_length_timer : 6;
	padding : 2;
};

bitfield NoisePolynomial {
	clock_divider : 3;                 // Divisors: 8,16,32,48,64,80,96,112.
	short_lfsr : 1;                    // 1: 7-bit; 0: 15-bit.
	clock_shift : 4;
};

bitfield NoiseControl {
	padding : 6;
	length_enabled : 1;
	trigger : 1;
};

bitfield AudioVolume {
	right_volume : 3;
	vin_right : 1;
	left_volume : 3;
	vin_left : 1;
};

bitfield AudioPanning {
	channel1_right : 1;
	channel2_right : 1;
	channel3_right : 1;
	channel4_right : 1;
	channel1_left : 1;
	channel2_left : 1;
	channel3_left : 1;
	channel4_left : 1;
};

bitfield AudioMaster {
	channel1_active : 1;                // Bits 0..3 read-only.
	channel2_active : 1;
	channel3_active : 1;
	channel4_active : 1;
	padding : 3;
	audio_enabled : 1;
};

bitfield WaveSamples {
	second_sample : 4;
	first_sample : 4;
};

bitfield LcdControl {
	bg_window_enable_or_cgb_priority : 1;
	objects_enabled : 1;
	objects_8x16 : 1;
	bg_map_9c00 : 1;
	tile_data_8000_unsigned : 1;        // 0: signed IDs relative to 9000.
	window_enabled : 1;
	window_map_9c00 : 1;
	lcd_enabled : 1;
};

bitfield LcdStatus {
	PpuMode mode : 2;                  // Read-only.
	ly_equals_lyc : 1;                  // Read-only.
	hblank_interrupt : 1;
	vblank_interrupt : 1;
	oam_interrupt : 1;
	lyc_interrupt : 1;
	padding : 1;
};

bitfield DmgPalette {
	DmgShade color0 : 2;               // Ignored for OBP0/OBP1: OBJ index 0 is transparent.
	DmgShade color1 : 2;
	DmgShade color2 : 2;
	DmgShade color3 : 2;
};

bitfield CpuMode {
	padding : 2;
	dmg_compatibility : 1;              // Boot-ROM-only; locked when boot ROM is unmapped.
	unknown : 5;
};

bitfield SpeedSwitch {
	switch_armed : 1;                   // Arm, then execute STOP.
	padding : 6;
	double_speed : 1;                   // Read-only.
};

bitfield VramBank {
	bank : 1;
	padding : 7;
};

bitfield VramDmaControl {
	blocks_minus_one : 7;               // Transfer length = (value + 1) * 16 bytes.
	hblank_on_write_inactive_on_read : 1;
};

bitfield Infrared {
	led_on : 1;
	no_signal : 1;                      // Read-only, 0 means receiving.
	padding : 4;
	read_enable : 2;                    // 3 enables receiver; 0 disables it.
};

bitfield PaletteIndex {
	byte_index : 6;
	padding : 1;
	auto_increment_on_write : 1;
};

bitfield ObjectPriority {
	dmg_x_priority : 1;                 // 0: CGB OAM order; 1: DMG x-coordinate order.
	padding : 7;
};

bitfield WramBank {
	bank : 3;                          // 0 aliases bank 1.
	padding : 5;
};

bitfield Undocumented75 {
	padding : 4;
	storage : 3;
	padding : 1;
};

bitfield Pcm12 {
	channel1 : 4;
	channel2 : 4;
};

bitfield Pcm34 {
	channel3 : 4;
	channel4 : 4;
};

// Offsets below are relative to FF00; gaps preserve exact register addresses.
// CGB-only fields are retained in DMG dumps for address consistency.
struct GameBoyIo {
	Joypad JOYP;                       // FF00: joypad / SGB packet transport.
	u8 SB;                             // FF01: serial data.
	SerialControl SC;                   // FF02.
	u8 unused_ff03;
	u8 DIV;                            // FF04: any write resets divider.
	u8 TIMA;                           // FF05: timer counter.
	u8 TMA;                            // FF06: timer reload value.
	TimerControl TAC;                   // FF07.
	u8 unused_ff08_ff0e[7];
	Interrupts IF;                      // FF0F: requested interrupts.
	AudioSweep NR10;                    // FF10: channel 1.
	AudioDutyLength NR11;               // FF11.
	AudioEnvelope NR12;                 // FF12.
	u8 NR13;                           // FF13: period low, write-only.
	AudioPeriodHigh NR14;               // FF14.
	u8 unused_ff15;
	AudioDutyLength NR21;               // FF16: channel 2.
	AudioEnvelope NR22;                 // FF17.
	u8 NR23;                           // FF18: period low, write-only.
	AudioPeriodHigh NR24;               // FF19.
	WaveDac NR30;                       // FF1A: channel 3.
	u8 NR31;                           // FF1B: length = 256 - value, write-only.
	WaveOutputLevel NR32;               // FF1C.
	u8 NR33;                           // FF1D: period low, write-only.
	AudioPeriodHigh NR34;               // FF1E.
	u8 unused_ff1f;
	NoiseLength NR41;                   // FF20: channel 4.
	AudioEnvelope NR42;                 // FF21.
	NoisePolynomial NR43;               // FF22.
	NoiseControl NR44;                  // FF23.
	AudioVolume NR50;                   // FF24.
	AudioPanning NR51;                  // FF25.
	AudioMaster NR52;                   // FF26.
	u8 unused_ff27_ff2f[9];
	WaveSamples wave_ram[16];           // FF30..FF3F: 32 four-bit samples.
	LcdControl LCDC;                    // FF40.
	LcdStatus STAT;                     // FF41.
	u8 SCY;                            // FF42: scroll y.
	u8 SCX;                            // FF43: scroll x.
	u8 LY;                             // FF44: scanline, read-only.
	u8 LYC;                            // FF45: scanline compare.
	u8 DMA;                            // FF46: write source high byte; copies 160 bytes to OAM.
	DmgPalette BGP;                     // FF47: non-CGB background palette.
	DmgPalette OBP0;                    // FF48: non-CGB object palette 0.
	DmgPalette OBP1;                    // FF49: non-CGB object palette 1.
	u8 WY;                             // FF4A: window y.
	u8 WX;                             // FF4B: window x + 7.
	CpuMode KEY0;                       // FF4C: CGB.
	SpeedSwitch KEY1;                   // FF4D: CGB.
	u8 unused_ff4e;
	VramBank VBK;                       // FF4F: CGB.
	u8 BOOT;                           // FF50: boot ROM unmap, write-only.
	u8 HDMA1;                          // FF51: CGB DMA source high, write-only.
	u8 HDMA2;                          // FF52: source low, low nibble ignored, write-only.
	u8 HDMA3;                          // FF53: destination bits 12..8, write-only.
	u8 HDMA4;                          // FF54: destination bits 7..4, write-only.
	VramDmaControl HDMA5;               // FF55: CGB.
	Infrared RP;                        // FF56: CGB infrared.
	u8 unused_ff57_ff67[17];
	PaletteIndex BCPS;                  // FF68: CGB BG palette index (BGPI).
	u8 BCPD;                           // FF69: CGB BG palette byte (BGPD).
	PaletteIndex OCPS;                  // FF6A: CGB OBJ palette index (OBPI).
	u8 OCPD;                           // FF6B: CGB OBJ palette byte (OBPD).
	ObjectPriority OPRI;                // FF6C: CGB.
	u8 unused_ff6d_ff6f[3];
	WramBank SVBK;                      // FF70: CGB.
	u8 unused_ff71;
	u8 undocumented_ff72;               // CGB storage, R/W.
	u8 undocumented_ff73;               // CGB storage, R/W.
	u8 undocumented_ff74;               // CGB-mode storage, R/W.
	Undocumented75 undocumented_ff75;
	Pcm12 PCM12;                        // FF76: CGB channel 1/2 output, read-only.
	Pcm34 PCM34;                        // FF77: CGB channel 3/4 output, read-only.
	u8 unused_ff78_ff7f[8];
};

// Graphics structures can also be placed manually over known ROM asset offsets.
struct TileRow2bpp {
	u8 low_plane;                      // Bit 7 is the leftmost pixel.
	u8 high_plane;                     // Pixel index = low bit | (high bit << 1).
};

struct Tile2bpp {
	TileRow2bpp rows[8];
};

bitfield BgMapAttributes {
	cgb_palette : 3;
	tile_vram_bank : 1;
	padding : 1;
	x_flip : 1;
	y_flip : 1;
	bg_priority : 1;
};

union TileMap {
	u8 tile_ids[1024];                  // VRAM bank 0: 32 rows of 32 tile IDs.
	BgMapAttributes attributes[1024];   // VRAM bank 1: corresponding CGB attributes.
};

struct GameBoyVram {
	Tile2bpp tiles[384];                // 8000..97FF.
	TileMap map_9800;
	TileMap map_9c00;
};

bitfield ObjectAttributes {
	cgb_palette : 3;
	cgb_tile_bank : 1;
	dmg_palette_1 : 1;
	x_flip : 1;
	y_flip : 1;
	behind_bg_colors_1_to_3 : 1;
};

struct OamObject {
	u8 y_plus_16;
	u8 x_plus_8;
	u8 tile_index;                     // In 8x16 mode, bit 0 is ignored.
	ObjectAttributes attributes;
};

bitfield Rgb555 {
	red : 5;
	green : 5;
	blue : 5;
	padding : 1;
};

struct CgbPalette {
	Rgb555 colors[4];
};

// Not directly CPU-mapped: dump separately through BGPI/BGPD or OBPI/OBPD.
// Each palette RAM bank contains eight palettes (64 bytes).
struct CgbPaletteRam {
	CgbPalette palettes[8];
};

// MBC control registers are WRITE destinations, not readable ROM structures.
// These enums are reference constants; no control state is overlaid onto ROM.
// Other cartridge types above need their own mapper-specific device protocols.
enum Mbc1WriteAddress : u16 {
	RamEnable_0000_1fff = 0x0000,       // Low nibble 0xA enables; anything else disables.
	RomBankLow5_2000_3fff = 0x2000,     // 0 aliases 1 before masking to ROM size.
	BankHigh2_4000_5fff = 0x4000,       // Upper ROM bits or RAM bank, depends on wiring.
	BankingMode_6000_7fff = 0x6000       // 0: simple; 1: advanced RAM/ROM banking.
};

enum Mbc1Mode : u8 {
	Simple = 0,
	Advanced = 1
};

enum RamEnableValue : u8 {
	Disable = 0x00,
	Enable = 0x0A
};

// MBC2 decodes address bit 8 throughout 0000..3FFF, not two contiguous ranges.
enum Mbc2WriteAddress : u16 {
	RamEnable_AddressBit8Clear = 0x0000,
	RomBankLow4_AddressBit8Set = 0x2100  // 0 aliases 1; RAM cells at A000..A1FF, mirrored.
};

enum Mbc3WriteAddress : u16 {
	RamRtcEnable_0000_1fff = 0x0000,
	RomBank7_2000_3fff = 0x2000,        // 0 aliases 1 (MBC30 uses 8 bits).
	RamRtcSelect_4000_5fff = 0x4000,
	LatchClock_6000_7fff = 0x6000       // Write 0, then 1, to latch RTC.
};

enum Mbc3RamRtcSelect : u8 {
	RamBank0 = 0x00,
	RamBank1 = 0x01,
	RamBank2 = 0x02,
	RamBank3 = 0x03,
	Mbc30RamBank4 = 0x04,
	Mbc30RamBank5 = 0x05,
	Mbc30RamBank6 = 0x06,
	Mbc30RamBank7 = 0x07,
	RtcSeconds = 0x08,
	RtcMinutes = 0x09,
	RtcHours = 0x0A,
	RtcDayLow = 0x0B,
	RtcDayHigh = 0x0C
};

bitfield RtcDayHigh {
	day_bit8 : 1;
	padding : 5;
	halted : 1;
	day_overflow : 1;
};

// A convenient five-byte export layout, NOT five adjacent CPU registers.
// Only the selected RTC register appears at A000..BFFF, repeated at every byte.
struct Mbc3RtcSnapshot {
	u8 seconds;
	u8 minutes;
	u8 hours;
	u8 day_low;
	RtcDayHigh day_high;
};

enum Mbc5WriteAddress : u16 {
	RamEnable_0000_1fff = 0x0000,
	RomBankLow8_2000_2fff = 0x2000,     // Bank 0 is allowed.
	RomBankBit8_3000_3fff = 0x3000,
	RamBank4_4000_5fff = 0x4000         // Rumble carts: bit 3 motor, bits 0..2 RAM bank.
};

bitfield Mbc5RumbleRamBank {
	ram_bank : 3;
	rumble_on : 1;
	padding : 4;
};

// A raw ROM bank N starts at file offset N * 0x4000.
// Its usual CPU address is 0x4000 + (file_offset % 0x4000) for N > 0.
struct RomBank {
	u8 bytes[0x4000];
};

if (GB_CPU_MEMORY) {
	std::assert (std::mem::size () >= 0x10000, "CPU memory mode requires a 64 KiB dump");
	GameBoyVectors vectors @ 0x0000;
	GameBoyHeader header @ 0x0100;
	u8 rom0_before_header[0x98] @ 0x0068;
	u8 rom0_after_header[0x3EB0] @ 0x0150;
	RomBank selected_rom_bank @ 0x4000;
	GameBoyVram vram @ 0x8000;
	u8 cartridge_ram_or_device[0x2000] @ 0xA000;
	u8 wram_bank0[0x1000] @ 0xC000;
	u8 selected_wram_bank[0x1000] @ 0xD000;
	u8 echo_c000_ddff[0x1E00] @ 0xE000;
	OamObject oam[40] @ 0xFE00;
	u8 unusable_fea0_feff[0x60] @ 0xFEA0;
	GameBoyIo io @ 0xFF00;
	u8 hram[0x7F] @ 0xFF80;
	Interrupts IE @ 0xFFFF;
} else {
	std::assert (std::mem::size () >= 0x150, "ROM is too short for a Game Boy header");
	GameBoyVectors vectors @ 0x0000;
	GameBoyHeader header @ 0x0100;
}
