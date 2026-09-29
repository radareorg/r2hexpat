struct Parent<T> {
    T inherited;
};

struct Child<T> : Parent<T> {
    T own;
};

Child<u32> test @ 0;

std::assert(test.inherited == 0x474E5089, "Inherited field invalid");
std::assert(test.own == 0x0A1A0A0D, "Own field invalid");
