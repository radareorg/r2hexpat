fn add(auto left, auto right) {
    return left + right;
};

fn add_defaults(auto left, auto right = 7) {
    return left + right;
};

std::assert(add(2, 3) == 5, "Two-argument function failed");
std::assert(add(-2, 3) == 1, "Signed function arguments failed");
std::assert(add_defaults(5) == 12, "Default argument failed");
std::assert(add_defaults(5, 9) == 14, "Default argument override failed");

fn factorial(auto value) {
    if (value <= 1)
        return 1;
    return value * factorial(value - 1);
};

std::assert(factorial(0) == 1, "Factorial zero case failed");
std::assert(factorial(1) == 1, "Factorial one case failed");
std::assert(factorial(5) == 120, "Recursive factorial failed");

fn fibonacci(auto value) {
    if (value < 2)
        return value;
    return fibonacci(value - 1) + fibonacci(value - 2);
};

std::assert(fibonacci(0) == 0, "Fibonacci zero case failed");
std::assert(fibonacci(1) == 1, "Fibonacci one case failed");
std::assert(fibonacci(2) == 1, "Fibonacci two case failed");
std::assert(fibonacci(6) == 8, "Recursive fibonacci failed");

fn mutate_array(ref u32 values, auto index, auto value) {
    values[index] = value;
};

u32 mutableArray[3] = { 1, 2, 3 };
mutate_array(mutableArray, 0, 9);
mutate_array(mutableArray, 2, 7);
std::assert(mutableArray[0] == 9, "Reference array first mutation failed");
std::assert(mutableArray[1] == 2, "Reference array untouched element changed");
std::assert(mutableArray[2] == 7, "Reference array last mutation failed");

fn select(auto condition, auto left, auto right) {
    if (condition)
        return left;
    return right;
};

std::assert(select(true, 11, 22) == 11, "Function early true return failed");
std::assert(select(false, 11, 22) == 22, "Function fallthrough return failed");

fn nested_scope(auto value) {
    if (true) {
        u32 nestedValue = 99;
        std::assert(nestedValue == 99, "Nested function local failed");
    }
    return value;
};

std::assert(nested_scope(12) == 12, "Function parameter changed by nested scope");
