struct TestStruct {
    s32 variable;
    padding[20];
    u8 array[0x10];
};

TestStruct testStruct @ 0x100;
