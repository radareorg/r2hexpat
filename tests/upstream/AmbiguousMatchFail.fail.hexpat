fn classify(auto value) {
    match (value) {
        (1 ... 5): return 1;
        (3 ... 7): return 2;
        (_): return 0;
    }
};

classify(4);
