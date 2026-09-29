namespace First {
    fn value() { return 11; };
    fn add(auto left, auto right) { return left + right; };

    struct Item {
        u32 value;
    };

    enum Kind : u8 { One = 1, Two = 2 };

    namespace Nested {
        fn value() { return 22; };

        struct Item {
            u16 value;
        };
    }
}

namespace Second {
    fn value() { return 33; };

    struct Item {
        u64 value;
    };

    enum Kind : u8 { One = 10, Two = 20 };
}

std::assert(First::value() == 11, "First namespace function failed");
std::assert(First::Nested::value() == 22, "Nested namespace function failed");
std::assert(Second::value() == 33, "Second namespace function failed");
std::assert(First::add(4, 5) == 9, "Namespaced function arguments failed");

First::Item firstItem;
First::Nested::Item nestedItem;
Second::Item secondItem;
firstItem.value = 101;
nestedItem.value = 202;
secondItem.value = 303;

std::assert(firstItem.value == 101, "First namespaced type failed");
std::assert(nestedItem.value == 202, "Nested namespaced type failed");
std::assert(secondItem.value == 303, "Second namespaced type failed");
std::assert(sizeof(firstItem) == 4, "First namespaced type size failed");
std::assert(sizeof(nestedItem) == 2, "Nested namespaced type size failed");
std::assert(sizeof(secondItem) == 8, "Second namespaced type size failed");
std::assert(typenameof(firstItem) == "First::Item", "First namespaced type name failed");
std::assert(typenameof(nestedItem) == "First::Nested::Item", "Nested namespaced type name failed");
std::assert(typenameof(secondItem) == "Second::Item", "Second namespaced type name failed");

std::assert(First::Kind::One == 1, "First namespaced enum failed");
std::assert(First::Kind::Two == 2, "First namespaced enum second value failed");
std::assert(Second::Kind::One == 10, "Second namespaced enum failed");
std::assert(Second::Kind::Two == 20, "Second namespaced enum second value failed");

First::Kind firstKind = First::Kind::Two;
Second::Kind secondKind = Second::Kind::Two;
std::assert(firstKind == 2, "Namespaced enum local initialization failed");
std::assert(secondKind == 20, "Second namespaced enum local initialization failed");
