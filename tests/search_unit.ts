import { compile, SearchPattern } from "../lib/index";

export function testSearchPatterns(): void {
  const src = `
enum Role : u8 { Warrior, Mage, Rogue };
struct Vec3 { float x; float y; float z; };
struct Player { u32 health; u32 lives; Role role; Vec3 position; Player *next : u64; };
struct Container { u8 tag; Player players[2]; u16 tail; };
struct Packed { u8 tag; u32 value; } [[packed]];
struct Explicit { u8 tag; u32 value [[align(8)]]; };
struct Padded { u8 tag; padding[3]; u32 value; };
struct TailPadded { u8 tag; } [[fixed_size(4)]];
union Word { u32 value; u8 bytes[4]; };
bitfield Bits { low : 3; bool enabled : 1; signed high : 4; };
bitfield Ordered { low : 3; high : 13; } [[bitfield_order(1, 16)]];
struct Flags { u8 tag; be Ordered ordered [[align(2)]]; Bits bits; };
struct Strings { char text[4]; be char16 wide[2]; float number; float16 half; };
template_unused(); // must not execute top-level code when instantiating types
fn main() { std::assert(false, "main must not run"); };
const u32 COUNT = 2;
struct Array<T, auto N> { T values[N]; };
namespace ns { const u32 N = 3; struct Numbers { be u16 values[N]; }; }
struct Dynamic { u8 length; u8 payload[length]; };
struct Unsized { char text[]; };
struct Conditional { u8 tag; if (tag == 1) { u32 value; } };
struct Transform { u32 value [[transform("decode")]]; };
`;
  const program = compile(src);
  const check = (ok: boolean, msg: string): void => { if (!ok) throw new Error("search: " + msg); };
  const fails = (run: () => any, msg: string): void => {
    try { run(); } catch (e) {
      check(e instanceof Error && e.message.includes(msg), "wrong error: " + String(e));
      return;
    }
    throw new Error("search: expected error containing " + msg);
  };
  const packed = new SearchPattern(program, "Player");
  check(packed.size === 29 && packed.alignment === 1, "packed size");
  check(packed.get("health") === undefined && !packed.isDefined("health"), "unset health read as zero");
  check(packed.state() === "unset", "initial state");
  packed.set({ health: 0, position: { z: 3 } });
  check(packed.get("health") === 0n && packed.isDefined("health"), "zero is not defined");
  check(packed.state("position") === "partial" && packed.state() === "partial", "nested partial state");
  check(packed.get("position").z === 3 && packed.get("position").x === undefined, "nested get");
  packed.unset("health").unset("position");
  check(packed.state() === "unset" && packed.encode().mask.every((b) => b === 0), "unset did not clear mask");

  const p = new SearchPattern(program, "Player", { alignment: 8 });
  check(p.size === 32 && p.alignment === 8, "aligned size");
  p.assign("health = 100 lives=1+2 role=Role::Rogue position.z=3 next=0x1122334455667788");
  const enc = p.encode();
  check(Array.from(enc.bytes.slice(0, 8)).join() === "100,0,0,0,3,0,0,0", "scalar encoding");
  check(enc.bytes[8] === 2 && enc.mask[8] === 255, "enum encoding");
  check(enc.mask.slice(9, 20).every((b) => b === 0), "padding/unknown floats constrained");
  check(Array.from(enc.bytes.slice(20, 24)).join() === "0,0,64,64", "nested float offset");
  check(Array.from(enc.bytes.slice(24)).join() === "136,119,102,85,68,51,34,17", "pointer encoding");
  check(p.fields().find((f) => f.path === "next")!.value === "1234605616436508552", "large integer JSON");
  enc.bytes.fill(0); check(p.encode().bytes[0] === 100, "encode exposed mutable state");
  const before = p.toR2();
  fails(() => p.assign("health=2 nope=3"), "unknown search field");
  fails(() => p.set({ health: 2, nope: 3 }), "unknown search field");
  check(p.toR2() === before, "failed updates changed instance");
  fails(() => p.assign("health=2 lives="), "expression");
  fails(() => p.assign("health += 1"), "field=expression");
  fails(() => p.assign("health=$[0]"), "cannot read input data");
  fails(() => p.set("health", undefined), "unset()");
  fails(() => p.set("next", 9007199254740992), "safe integer number or bigint");
  fails(() => p.state("nope"), "unknown search field");
  p.unset("position"); check(!p.isDefined("position.z"), "aggregate unset");
  p.set("next", null); check(p.isDefined("next") && p.get("next") === 0n, "null pointer was unset");

  const c = new SearchPattern(program, "Container", { alignment: 8 });
  check(c.size === 80 && c.alignment === 8, "aligned struct array size");
  c.set("players", [{ health: 100 }, { position: { z: 3 } }]);
  check(c.fields().find((f) => f.path === "players[0].health")!.offset === 8, "first array element offset");
  check(c.fields().find((f) => f.path === "players[1].position.z")!.offset === 60, "second array element offset");
  check(c.encode().mask.slice(74).every((b) => b === 0), "tail padding constrained");
  fails(() => c.set("players[2].health", 100), "unknown search field");
  c.unset("players[0]"); check(!c.isDefined("players[0].health") && c.isDefined("players[1].position.z"), "indexed unset");
  const custom = new SearchPattern(program, "Packed", { alignment: 8 });
  check(custom.size === 5 && custom.alignment === 1, "packed type override");
  const explicit = new SearchPattern(program, "Explicit");
  explicit.set("value", 3);
  check(explicit.size === 16 && explicit.alignment === 8 && explicit.encode().bytes[8] === 3, "explicit member alignment");
  const pad = new SearchPattern(program, "Padded").set("value", 3);
  check(pad.size === 8 && pad.encode().mask.slice(0, 4).every((b) => b === 0), "explicit padding constrained");
  const tail = new SearchPattern(program, "TailPadded").set("tag", 3);
  check(tail.size === 4 && tail.encode().mask[0] === 255 && tail.encode().mask.slice(1).every((b) => b === 0), "fixed tail padding constrained");

  const word = new SearchPattern(program, "Word").set("value", 0x12345678);
  word.set("bytes[0]", 0x78);
  const oldWord = word.toR2();
  fails(() => word.set("bytes[0]", 0x79), "conflicting search field");
  check(word.toR2() === oldWord, "conflict did not preserve instance");
  word.assign("value=0x12345679 bytes[0]=0x79"); // simultaneous overlapping update
  word.unset("value");
  check(word.encode().mask[0] === 255 && word.encode().mask.slice(1).every((b) => b === 0), "union unset removed another constraint");
  const bits = new SearchPattern(program, "Bits").set("low", 3);
  check(bits.toR2() === "03:07", "bit mask constrained neighboring fields");
  bits.set("enabled", false).set("high", -2);
  check(bits.toR2() === "e3:ff" && bits.state() === "set", "signed/bool bitfield encoding");
  bits.unset("low"); check(bits.toR2() === "e0:f8", "bitfield unset");
  const flags = new SearchPattern(program, "Flags").set("ordered.low", 3);
  check(flags.size === 6 && flags.toR2() === "000000030000:000000070000", "aligned/reversed bitfield offset");
  check(flags.fields().find((f) => f.path === "ordered.low")!.offset === 3, "physical bitfield offset");
  const str = new SearchPattern(program, "Strings").assign('text="a=b" wide="AB" number=1.5 half=1.5');
  check(str.toR2() === "613d6200004100420000c03f003e:" + "ff".repeat(14), "strings and floats");
  fails(() => str.set("text", "too long"), "string exceeds field");
  const arr = new SearchPattern(program, "Array<u16, COUNT>").assign("values[COUNT-1] = 0x1234");
  check(arr.toR2() === "00003412:0000ffff", "template/constant indices");
  const ns = new SearchPattern(program, "ns::Numbers").assign("values[1]=0x1234");
  check(ns.toR2() === "000012340000:0000ffff0000", "namespace constant/endianness");
  fails(() => new SearchPattern(program, "Dynamic"), "unset field");
  fails(() => new SearchPattern(program, "Unsized"), "fixed, contiguous");
  fails(() => new SearchPattern(program, "Conditional"), "fixed declarations");
  fails(() => new SearchPattern(program, "Transform"), "raw fields");
  fails(() => new SearchPattern(program, "Player", { alignment: 3 }), "alignment must");
  fails(() => new SearchPattern(program, "Player", { maxSize: 4 }), "maximum size");
  fails(() => new SearchPattern(program, "Player", { maxFields: 2 }), "field count");
  const abi = compile("#pragma abi native\nstruct S { u8 tag; u32 value; };");
  fails(() => new SearchPattern(abi, "S"), "target ABI is not inferred");
  check(new SearchPattern(abi, "S", { alignment: 4 }).size === 8, "explicit ABI layout policy");
  check(new SearchPattern(compile("#pragma abi packed\nstruct S { u8 tag; u32 value; };"), "S").size === 5, "packed ABI default");
  const bounded = compile("#pragma array_limit 0\nstruct Empty {}; struct Huge { Empty entries[4]; u8 tag; };");
  fails(() => new SearchPattern(bounded, "Huge", { maxFields: 2 }), "array grew past set limit");
  console.log("[test] Partial search patterns OK");
}
