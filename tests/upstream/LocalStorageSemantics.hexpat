struct Pair {
    u32 first;
    u32 second;
};

struct Container {
    Pair pair;
    u32 values[3];
};

Pair pair;
pair.first = 10;
pair.second = 20;
std::assert(pair.first == 10, "Local struct first member failed");
std::assert(pair.second == 20, "Local struct second member failed");

Pair copiedPair = pair;
std::assert(copiedPair.first == 10, "Local struct copy first member failed");
std::assert(copiedPair.second == 20, "Local struct copy second member failed");
copiedPair.first = 99;
std::assert(pair.first == 10, "Local struct copy aliased source");
std::assert(copiedPair.first == 99, "Local struct copy mutation failed");

Pair pairs[3];
pairs[0].first = 1;
pairs[0].second = 2;
pairs[1].first = 3;
pairs[1].second = 4;
pairs[2].first = 5;
pairs[2].second = 6;
std::assert(pairs[0].first == 1 && pairs[0].second == 2, "Local struct array first entry failed");
std::assert(pairs[1].first == 3 && pairs[1].second == 4, "Local struct array middle entry failed");
std::assert(pairs[2].first == 5 && pairs[2].second == 6, "Local struct array last entry failed");

pairs[2] = pairs[0];
std::assert(pairs[0].first == 1 && pairs[0].second == 2, "Struct array copy changed source");
std::assert(pairs[2].first == 1 && pairs[2].second == 2, "Struct array copy failed");

u32 values[5] = { 2, 4, 6, 8, 10 };
std::assert(values[0] == 2, "Array initializer first element failed");
std::assert(values[1] == 4, "Array initializer second element failed");
std::assert(values[2] == 6, "Array initializer third element failed");
std::assert(values[3] == 8, "Array initializer fourth element failed");
std::assert(values[4] == 10, "Array initializer fifth element failed");

values[1] = values[4];
values[3] = values[0] + values[2];
std::assert(values[1] == 10, "Array indexed assignment failed");
std::assert(values[3] == 8, "Array expression assignment failed");

Container container;
container.pair.first = 11;
container.pair.second = 12;
container.values[0] = 13;
container.values[1] = 14;
container.values[2] = 15;
std::assert(container.pair.first == 11, "Nested struct first member failed");
std::assert(container.pair.second == 12, "Nested struct second member failed");
std::assert(container.values[0] == 13, "Nested array first member failed");
std::assert(container.values[1] == 14, "Nested array middle member failed");
std::assert(container.values[2] == 15, "Nested array last member failed");

Container copiedContainer = container;
copiedContainer.pair.first = 100;
copiedContainer.values[1] = 200;
std::assert(container.pair.first == 11, "Nested struct copy aliased source member");
std::assert(container.values[1] == 14, "Nested array copy aliased source element");
std::assert(copiedContainer.pair.first == 100, "Nested struct copy mutation failed");
std::assert(copiedContainer.values[1] == 200, "Nested array copy mutation failed");

fn make_pair(auto first, auto second) {
    Pair result;
    result.first = first;
    result.second = second;
    return result;
};

Pair returnedPair = make_pair(21, 22);
std::assert(returnedPair.first == 21, "Returned struct first member failed");
std::assert(returnedPair.second == 22, "Returned struct second member failed");

str names[3];
names[0] = "zero";
names[1] = "one";
names[2] = "two";
std::assert(names[0] == "zero", "String array first element failed");
std::assert(names[1] == "one", "String array middle element failed");
std::assert(names[2] == "two", "String array last element failed");
names[1] = names[0];
std::assert(names[0] == "zero", "String array copy changed source");
std::assert(names[1] == "zero", "String array copy failed");
std::assert(names[2] == "two", "String array copy changed neighbor");

Pair autoCopySource[2];
autoCopySource[0].first = 0;
autoCopySource[1].first = 1;
autoCopySource[0].second = 2;
autoCopySource[1].second = 3;

Pair typedAggregateCopy = autoCopySource[1];
auto inferredAggregateCopy = autoCopySource[1];
std::assert(sizeof(inferredAggregateCopy) == sizeof(Pair), "Inferred aggregate changed source layout");
std::assert(typedAggregateCopy.first == 1, "Typed aggregate copy first member failed");
std::assert(typedAggregateCopy.second == 3, "Typed aggregate copy second member failed");
std::assert(inferredAggregateCopy.first == 1, "Inferred aggregate copy first member failed");
std::assert(inferredAggregateCopy.second == 3, "Inferred aggregate copy second member failed");

inferredAggregateCopy.first = 0x100000001;
inferredAggregateCopy.second = 0x100000003;
std::assert(inferredAggregateCopy.first == 0x100000001, "Inferred aggregate first member was truncated");
std::assert(inferredAggregateCopy.second == 0x100000003, "Inferred aggregate second member was truncated");
std::assert(sizeof(inferredAggregateCopy) == sizeof(Pair), "Inferred member assignment changed aggregate layout");

struct AutoCopyByteTest {
    u8 x;
    u8 y;
};

AutoCopyByteTest autoCopyBytes[2];
autoCopyBytes[0].x = 0;
autoCopyBytes[1].x = 1;
autoCopyBytes[0].y = 2;
autoCopyBytes[1].y = 3;

AutoCopyByteTest typedByteCopy = autoCopyBytes[1];
auto inferredByteCopy = autoCopyBytes[1];
std::assert(sizeof(inferredByteCopy) == sizeof(AutoCopyByteTest), "Inferred u8 aggregate changed source layout");
inferredByteCopy.x = 300;
std::assert(inferredByteCopy.x == 300, "Inferred u8 aggregate member was truncated");
std::assert(inferredByteCopy.y == 3, "Inferred aggregate copy changed adjacent member");
std::assert(autoCopyBytes[1].x == 1, "Inferred aggregate copy aliased its source");
std::assert(sizeof(inferredByteCopy) == sizeof(AutoCopyByteTest), "Inferred u8 member assignment changed aggregate layout");

typedByteCopy.x = 300;
std::assert(typedByteCopy.x == u8(300), "Typed aggregate copy did not preserve member type");

struct NestedAutoCopyTest {
    AutoCopyByteTest inner;
    u16 value;
};

NestedAutoCopyTest nestedAutoCopySource;
nestedAutoCopySource.inner.x = 4;
nestedAutoCopySource.inner.y = 5;
nestedAutoCopySource.value = 6;
auto nestedAutoCopy = nestedAutoCopySource;
nestedAutoCopy.inner.x = 700;
nestedAutoCopy.value = 70000;
std::assert(nestedAutoCopy.inner.x == 700, "Nested inferred u8 member was truncated");
std::assert(nestedAutoCopy.inner.y == 5, "Nested inferred aggregate changed adjacent member");
std::assert(nestedAutoCopy.value == 70000, "Nested inferred u16 member was truncated");
std::assert(nestedAutoCopySource.inner.x == 4, "Nested inferred aggregate aliased its source");
