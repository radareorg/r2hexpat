// Packed by default; hexpatp --align 8 selects natural alignment capped at 8.
enum Role : u8 { Warrior, Mage, Rogue };
struct Vec3 { float x; float y; float z; };
struct Player {
    u32 health;
    u32 lives;
    Role role;
    Vec3 position;
    Player *next : u64;
};
