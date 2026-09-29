using Byte = u8;
using Word = u16;
using Identity<T> = T;

Byte byteValue = 0xAB;
Word wordValue = 0x1234;
Identity<u32> identityValue = 0x12345678;
std::assert(byteValue == 0xAB, "Primitive byte alias failed");
std::assert(wordValue == 0x1234, "Primitive word alias failed");
std::assert(identityValue == 0x12345678, "Generic identity alias failed");
std::assert(sizeof(Byte) == 1, "Primitive alias size failed");
std::assert(sizeof(Identity<u64>) == 8, "Generic alias size failed");

struct Box<T> {
    T value;
};

struct Pair<T, U> {
    T first;
    U second;
};

using U32Box = Box<u32>;
using BoxOf<T> = Box<T>;
using NestedBox<T> = Box<Box<T>>;

U32Box u32Box;
u32Box.value = 42;
std::assert(u32Box.value == 42, "Concrete struct alias failed");
std::assert(sizeof(u32Box) == 4, "Concrete struct alias size failed");

BoxOf<u16> genericBox;
genericBox.value = 77;
std::assert(genericBox.value == 77, "Generic struct alias failed");
std::assert(sizeof(genericBox) == 2, "Generic struct alias size failed");

NestedBox<u8> nestedBox;
nestedBox.value.value = 88;
std::assert(nestedBox.value.value == 88, "Nested generic alias failed");
std::assert(sizeof(nestedBox) == 1, "Nested generic alias size failed");

Pair<u8, u32> mixedPair;
mixedPair.first = 1;
mixedPair.second = 2;
std::assert(mixedPair.first == 1, "Mixed generic first member failed");
std::assert(mixedPair.second == 2, "Mixed generic second member failed");
std::assert(sizeof(mixedPair) == 5, "Mixed generic struct size failed");

struct SizedArray<T, auto Count> {
    T values[Count];
};

SizedArray<u16, 3> sizedArray;
sizedArray.values[0] = 10;
sizedArray.values[1] = 20;
sizedArray.values[2] = 30;
std::assert(sizedArray.values[0] == 10, "Value-template first element failed");
std::assert(sizedArray.values[1] == 20, "Value-template second element failed");
std::assert(sizedArray.values[2] == 30, "Value-template third element failed");
std::assert(sizeof(sizedArray) == 6, "Value-template size failed");

struct Base<T> {
    T base;
};

struct Derived<T> : Base<T> {
    T derived;
};

Derived<u32> derivedValue;
derivedValue.base = 100;
derivedValue.derived = 200;
std::assert(derivedValue.base == 100, "Local inherited member failed");
std::assert(derivedValue.derived == 200, "Local derived member failed");
std::assert(sizeof(derivedValue) == 8, "Local derived type size failed");

Derived<u32> copiedDerived = derivedValue;
copiedDerived.base = 300;
copiedDerived.derived = 400;
std::assert(derivedValue.base == 100, "Derived copy aliased base member");
std::assert(derivedValue.derived == 200, "Derived copy aliased own member");
std::assert(copiedDerived.base == 300, "Derived copy base mutation failed");
std::assert(copiedDerived.derived == 400, "Derived copy own mutation failed");

union Overlay {
    u32 whole;
    u8 bytes[4];
};

Overlay overlay;
overlay.whole = 0;
overlay.bytes[0] = 1;
std::assert(overlay.whole != 0, "Local union members do not overlap");
overlay.whole = 0;
std::assert(overlay.bytes[0] == 0, "Local union write did not update array member");
std::assert(sizeof(overlay) == 4, "Local union size failed");
