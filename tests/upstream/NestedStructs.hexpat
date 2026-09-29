fn end_of_body() {
    u32 start = addressof(parent.parent.hdr);
    u32 len = parent.parent.hdr.len;
    u32 end = start + len;

    return $ >= end;
};

struct Header {
    u8 len;
};

struct Body {
    u8 arr[while(!end_of_body())];
};

struct Data {
    Header hdr;
    Body body;
};

Data data @ 0x0;

std::assert(data.hdr.len == 0x89, "Invalid length");
std::assert(sizeof(data.body.arr) == 0x89 - 1, "Invalid size of body");
