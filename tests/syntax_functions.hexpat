// Functions, templates, match, pointers
fn fib(u32 n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
};
struct Pair<T, auto N> {
    T first;
    T rest[N];
};
Pair<u16, 2> pair @ 0x00;
fn kind(auto v) {
    match (v) {
        (0 ... 0x7f): return "low";
        (_): return "high";
    }
};
u8 *ptr : u8 @ 0x20;
std::print("fib={} kind={} {} sizeof={} type={}", fib(10), kind(pair.first & 0xff), kind(0xff), sizeof(pair), typenameof(pair));
