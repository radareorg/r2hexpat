fn array_sum(ref u32 values, auto count) {
    u32 result = 0;
    for (u32 index = 0, index < count, index += 1)
        result += values[index];
    return result;
};

fn array_min(ref u32 values, auto count) {
    u32 result = values[0];
    for (u32 index = 1, index < count, index += 1) {
        if (values[index] < result)
            result = values[index];
    }
    return result;
};

fn array_max(ref u32 values, auto count) {
    u32 result = values[0];
    for (u32 index = 1, index < count, index += 1) {
        if (values[index] > result)
            result = values[index];
    }
    return result;
};

fn array_reverse(ref u32 values, auto count) {
    for (u32 index = 0, index < count / 2, index += 1) {
        u32 temporary = values[index];
        values[index] = values[count - index - 1];
        values[count - index - 1] = temporary;
    }
};

fn array_find(ref u32 values, auto count, auto needle) {
    for (u32 index = 0, index < count, index += 1) {
        if (values[index] == needle)
            return index;
    }
    return -1;
};

u32 values[6] = { 9, 2, 7, 4, 1, 8 };
std::assert(array_sum(values, 6) == 31, "Array sum failed");
std::assert(array_sum(values, 1) == 9, "Array partial sum failed");
std::assert(array_sum(values, 0) == 0, "Empty array sum failed");
std::assert(array_min(values, 6) == 1, "Array minimum failed");
std::assert(array_max(values, 6) == 9, "Array maximum failed");
std::assert(array_find(values, 6, 9) == 0, "Array find first failed");
std::assert(array_find(values, 6, 4) == 3, "Array find middle failed");
std::assert(array_find(values, 6, 8) == 5, "Array find last failed");
std::assert(array_find(values, 6, 100) == -1, "Array find missing failed");

array_reverse(values, 6);
std::assert(values[0] == 8, "Even array reverse index 0 failed");
std::assert(values[1] == 1, "Even array reverse index 1 failed");
std::assert(values[2] == 4, "Even array reverse index 2 failed");
std::assert(values[3] == 7, "Even array reverse index 3 failed");
std::assert(values[4] == 2, "Even array reverse index 4 failed");
std::assert(values[5] == 9, "Even array reverse index 5 failed");
std::assert(array_sum(values, 6) == 31, "Reverse changed array sum");

u32 oddValues[5] = { 1, 2, 3, 4, 5 };
array_reverse(oddValues, 5);
std::assert(oddValues[0] == 5, "Odd array reverse index 0 failed");
std::assert(oddValues[1] == 4, "Odd array reverse index 1 failed");
std::assert(oddValues[2] == 3, "Odd array reverse center failed");
std::assert(oddValues[3] == 2, "Odd array reverse index 3 failed");
std::assert(oddValues[4] == 1, "Odd array reverse index 4 failed");

u32 dynamicCount = 4;
u32 dynamicValues[dynamicCount];
for (u32 index = 0, index < dynamicCount, index += 1)
    dynamicValues[index] = index * index;
std::assert(dynamicValues[0] == 0, "Dynamic array first value failed");
std::assert(dynamicValues[1] == 1, "Dynamic array second value failed");
std::assert(dynamicValues[2] == 4, "Dynamic array third value failed");
std::assert(dynamicValues[3] == 9, "Dynamic array fourth value failed");
std::assert(array_sum(dynamicValues, dynamicCount) == 14, "Dynamic array function argument failed");

u32 copiedValues[6];
for (u32 copyIndex = 0, copyIndex < 6, copyIndex += 1)
    copiedValues[copyIndex] = values[copyIndex];
std::assert(copiedValues[0] == 8, "Array copy first value failed");
std::assert(copiedValues[5] == 9, "Array copy last value failed");
copiedValues[0] = 100;
std::assert(values[0] == 8, "Array copy aliased source");
std::assert(copiedValues[0] == 100, "Array copy mutation failed");
