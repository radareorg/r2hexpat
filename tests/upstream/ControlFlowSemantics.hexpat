fn classify(auto value) {
    if (value < 0)
        return -1;
    else if (value == 0)
        return 0;
    else
        return 1;
};

std::assert(classify(-9) == -1, "Negative conditional branch failed");
std::assert(classify(0) == 0, "Zero conditional branch failed");
std::assert(classify(9) == 1, "Positive conditional branch failed");

fn sum_to(auto limit) {
    u32 sum = 0;
    u32 value = 1;
    while (value <= limit) {
        sum += value;
        value += 1;
    }
    return sum;
};

std::assert(sum_to(0) == 0, "Zero-iteration while failed");
std::assert(sum_to(1) == 1, "Single-iteration while failed");
std::assert(sum_to(10) == 55, "Multi-iteration while failed");

fn sum_odd_below(auto limit) {
    u32 sum = 0;
    for (u32 value = 0, value < limit, value += 1) {
        if (value % 2 == 0)
            continue;
        sum += value;
    }
    return sum;
};

std::assert(sum_odd_below(1) == 0, "For continue lower bound failed");
std::assert(sum_odd_below(6) == 9, "For continue failed");
std::assert(sum_odd_below(10) == 25, "For accumulation failed");

fn stop_at(auto limit) {
    u32 value = 0;
    while (true) {
        if (value == limit)
            break;
        value += 1;
    }
    return value;
};

std::assert(stop_at(0) == 0, "Immediate break failed");
std::assert(stop_at(7) == 7, "Delayed break failed");

fn nested_loops() {
    u32 count = 0;
    for (u32 outer = 0, outer < 3, outer += 1) {
        for (u32 inner = 0, inner < 4, inner += 1) {
            if (inner == 2)
                break;
            count += 1;
        }
    }
    return count;
};

std::assert(nested_loops() == 6, "Nested loop break failed");

fn match_value(auto value) {
    match (value) {
        (0): return 100;
        (1 | 2): return 200;
        (3 ... 5): return 300;
        (_): return 400;
    }
};

std::assert(match_value(0) == 100, "Exact match failed");
std::assert(match_value(1) == 200, "First alternative match failed");
std::assert(match_value(2) == 200, "Second alternative match failed");
std::assert(match_value(3) == 300, "Range match lower bound failed");
std::assert(match_value(5) == 300, "Range match upper bound failed");
std::assert(match_value(6) == 400, "Wildcard match failed");

fn match_pair(auto first, auto second) {
    match (first, second) {
        (1, 2): return 12;
        (1, 3 ... 9): return 10;
        (3 ... 9, 2): return 2;
        (_, _): return 0;
    }
};

std::assert(match_pair(1, 2) == 12, "Two-parameter exact match failed");
std::assert(match_pair(1, 9) == 10, "Two-parameter first wildcard failed");
std::assert(match_pair(9, 2) == 2, "Two-parameter second wildcard failed");
std::assert(match_pair(9, 9) == 0, "Two-parameter default failed");
