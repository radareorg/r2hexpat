struct Pair {
    u8 a;
    u8 b;
};

fn keep_child() {
    Pair pair;
    test::capture_child(pair);
};

fn main() {
    keep_child();
};
