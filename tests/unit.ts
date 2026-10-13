/// <reference path="../lib/globals.d.ts" />
import { runHexpat, BufferHost } from "../lib/index";
import { testSearchPatterns } from "./search_unit";
import { testMagic } from "./magic_unit";
import { testTree } from "./tree_unit";

const src = `
struct Header {
    u32 magic;
    u32 version;
};
Header header @ 0x0;
u32 checksum @ 0x8;
`;

// fake binary: ELF magic, version, checksum
const data = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x02, 0x00, 0x00, 0xaa, 0xbb, 0xcc, 0xdd]);

console.log("[test] running pipeline...");
const inst = runHexpat(src, new BufferHost(data));
inst.dump();

const header = inst.get("header");
if (!header || !header.children) throw new Error("header pattern missing!");
const magic = inst.value(header.children[0]);
console.log("[test] magic value: " + magic + " expected 1179403647 (0x464c457f)");
if (magic !== 0x464c457fn) throw new Error("magic mismatch!");
console.log("[test] OK");

// JSON serialization
import { toJson } from "../lib/index";
const js = JSON.stringify(toJson(inst, { base: 0x1000 }));
console.log("[test] json: " + js);
const parsed = JSON.parse(js);
if (parsed[0].name !== "header" || parsed[0].addr !== 0x1000 || parsed[0].children[0].value !== 0x464c457f) throw new Error("json mismatch!");
if (parsed[1].name !== "checksum" || parsed[1].value !== 0xddccbbaa) throw new Error("json checksum mismatch!");
console.log("[test] JSON OK");

// Interactive assignments must reach the host bytes, including overlapping views.
const editData = new Uint8Array(64).fill(0xff);
const edit = runHexpat(`
struct Header { u32 value; be u16 big; s8 signedValue; bool enabled; };
Header header @ 0;
u32 alias @ 0;
u16 values[2] @ 8;
bitfield Bits { low : 3; bool enabled : 1; signed high : 4; };
Bits bits @ 12;
be Bits big_bits @ 13;
bitfield Ordered { low : 3; high : 13; } [[bitfield_order(1, 16)]];
be Ordered ordered @ 14;
char text[4] @ 16;
be char16 wide[2] @ 20;
float number @ 24;
be double big_number @ 28;
float16 half @ 36;
struct PointerHeader { u8 *ptr : u8; };
PointerHeader pointers @ 40;
const u8 fixed = 7;
fn set_value(auto v) {
    auto old = alias + 0;
    header.value = v;
    std::assert(alias == v, "host cache retained bytes after a write");
};
`, new BufferHost(editData));

function check(ok: boolean, msg: string): void { if (!ok) throw new Error(msg); }
function fails(ev: typeof edit, src: string, message: string): void {
  try { ev.evaluateExpression(src); }
  catch (e) {
    check(e instanceof Error && e.message.indexOf(message) >= 0, "wrong error for " + src + ": " + String(e));
    return;
  }
  throw new Error("expected an error for " + src);
}
function bytes(addr: number, expected: number[]): void {
  check(expected.every((b, i) => editData[addr + i] === b), "wrong bytes at " + addr);
}
edit.evaluateExpression("alias + 0"); // cache the old value before the write
check(edit.evaluateExpression("header.value= 3") === undefined, "assignment should return no value");
bytes(0, [3, 0, 0, 0]);
check(edit.evaluateExpression("alias + 0") === 3n, "overlapping view is stale");
edit.evaluateExpression("header.value += 2;");
check(edit.evaluateExpression("header.value == 5") === true, "equality parsed as assignment");
check(edit.evaluateExpression("header.value >= 5") === true, "comparison parsed as assignment");
check(edit.evaluateExpression("header.value <= 5") === true, "comparison parsed as assignment");
check(edit.evaluateExpression("header.value != 3") === true, "inequality parsed as assignment");
check(edit.evaluateExpression('"a=b"') === "a=b", "string parsed as assignment");
fails(edit, "header.value = 9; header.value = 10", "trailing input");
fails(edit, "header.value =", "expression");
fails(edit, "header.value /= 0", "division by zero");
bytes(0, [5, 0, 0, 0]);
edit.evaluateExpression("header.big = 0x1234");
edit.evaluateExpression("header.signedValue = -2");
edit.evaluateExpression("header.enabled = false");
bytes(4, [0x12, 0x34, 0xfe, 0]);
edit.evaluateExpression("values[1] = 0x5678");
edit.evaluateExpression("values[0] = values[1] + 1");
bytes(8, [0x79, 0x56, 0x78, 0x56]);
fails(edit, "values[2] = 1", "out of bounds");
fails(edit, "fixed = 3", "constant variable");
edit.evaluateExpression("bits.low = 3");
edit.evaluateExpression("bits.enabled = false");
bytes(12, [0xf3]);
edit.evaluateExpression("bits.high = -2");
bytes(12, [0xe3]);
edit.evaluateExpression("big_bits.low = 3");
edit.evaluateExpression("big_bits.enabled = false");
bytes(13, [0x6f]);
edit.evaluateExpression("ordered.low = 3");
bytes(14, [0xff, 0xfb]);
check(edit.evaluateExpression("ordered.high + 0") === 8191n, "bitfield write changed neighbor");
edit.evaluateExpression('text = "ab"');
bytes(16, [0x61, 0x62, 0, 0]);
edit.evaluateExpression('wide = "A"');
bytes(20, [0, 0x41, 0, 0]);
edit.evaluateExpression("text[1] = 'c'");
bytes(16, [0x61, 0x63, 0, 0]);
edit.evaluateExpression("wide[1] = 'B'");
bytes(20, [0, 0x41, 0, 0x42]);
edit.evaluateExpression("number = 1.5");
bytes(24, [0, 0, 0xc0, 0x3f]);
edit.evaluateExpression("big_number = -2.0");
bytes(28, [0xc0, 0, 0, 0, 0, 0, 0, 0]);
edit.evaluateExpression("half = 1.5");
bytes(36, [0, 0x3e]);
check(edit.evaluateExpression("half + 0") === 1.5, "float16 write failed");
edit.evaluateExpression("half = 1.00048828125"); // ties round to an even significand
bytes(36, [0, 0x3c]);
edit.evaluateExpression("half = 0.000000059604644775390625");
bytes(36, [1, 0]);
edit.evaluateExpression("set_value(9)");
bytes(0, [9, 0, 0, 0]);
edit.evaluateExpression("pointers.ptr = 48");
bytes(40, [48]);
check(edit.value(edit.get("pointers")!.member("ptr")!) === 48n, "pointer assignment wrote pointee instead of pointer");
editData[0] = 10;
check(edit.evaluateExpression("header.value + 0") === 10n, "external host write is stale");

// Pattern-file assignments retain the reference runtime's read-only semantics.
const initial = runHexpat("u8 value @ 0; value = 7;", new BufferHost(editData));
check(editData[0] === 10 && initial.value(initial.get("value")!) === 7n, "pattern evaluation wrote host data");
initial.evaluateExpression("value = 11");
check(editData[0] === 11 && initial.value(initial.get("value")!) === 11n, "interactive assignment kept an override");
const readonly = runHexpat("u8 value @ 0; u8 local = 1;", { size: () => 1, read: () => new Uint8Array([2]) });
fails(readonly, "value = 3", "read-only");
check(readonly.evaluateExpression("value + 0") === 2n, "failed write changed visible value");
readonly.evaluateExpression("local = 3");
check(readonly.evaluateExpression("local + 0") === 3n, "local assignment needs writable host data");
const rejecting = runHexpat("u8 value @ 0; value = 7;", {
  size: () => 1, read: () => new Uint8Array([2]), write: () => { throw new Error("write rejected"); },
});
fails(rejecting, "value = 3", "write rejected");
check(rejecting.evaluateExpression("value + 0") === 7n, "failed write lost previous value");
const outside = runHexpat("u32 value @ 63;", new BufferHost(editData));
fails(outside, "value = 3", "outside the data");
const transformed = runHexpat('fn decode(auto v) { return v + 1; }; u8 value @ 0 [[transform("decode")]];', new BufferHost(editData));
fails(transformed, "value = 3", "transformed field");
check(editData[0] === 11, "rejected field write modified host bytes");
console.log("[test] Interactive writes OK");
testSearchPatterns();
testMagic();
testTree();
