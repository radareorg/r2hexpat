import { compile, SearchPattern } from "../lib/index";

export function testMagic(): void {
  const program = compile(`
#pragma endian big
enum Kind : u8 { One = 1 };
using Word = le u32;
struct Pair { Word value; };
union Overlay { le u32 word; u8 bytes[4]; };
struct Header {
  char magic[4];
  u16 version;
  Kind kind;
  padding[1];
  Pair pairs[2];
  Overlay overlay;
  s64 timestamp;
  le float ratio;
  double scale;
  le char16 name[2];
  Header *next : le u64;
};
struct Aligned { u8 tag; u32 value; };
struct BadWidth { u24 value; };
struct Half { float16 value; };
bitfield Bits { value : 3; };
struct Dynamic { u8 count; u8 data[count]; };
const u32 COUNT = 2;
struct Array<T, auto N> { T values[N]; };
namespace ns { struct Numbers { le u16 values[COUNT]; }; }
std::assert(false, "magic export must not execute the program");
fn main() { std::assert(false, "magic export must not run main"); };
`);
  const check = (ok: boolean, msg: string): void => { if (!ok) throw new Error("magic: " + msg); };
  const fails = (type: string, msg: string): void => {
    try { new SearchPattern(program, type).toMagic(); } catch (e) {
      check(e instanceof Error && e.message.includes(msg), "wrong error: " + String(e));
      return;
    }
    throw new Error("magic: expected error containing " + msg);
  };
  const header = new SearchPattern(program, "Header");
  const magic = header.toMagic();
  check(magic.startsWith("# Header size=52 align=1\n51\tubyte\tx\tHeader\n"), "header size guard");
  const field = (offset: number, type: string, path: string, format: string): void => {
    check(magic.split("\n").includes(">" + offset + "\t" + type + "\tx\t" + path + "=" + format), path);
  };
  field(0, "string", "magic", "%.4s");
  field(4, "ubeshort", "version", "0x%x");
  field(6, "ubyte", "kind", "0x%x");
  field(8, "ulelong", "pairs[0].value", "0x%x");
  field(12, "ulelong", "pairs[1].value", "0x%x");
  field(16, "ulelong", "overlay.word", "0x%x");
  field(19, "ubyte", "overlay.bytes[3]", "0x%x");
  field(20, "ubequad", "timestamp", "0x%llx");
  field(28, "lefloat", "ratio", "%g");
  field(32, "bedouble", "scale", "%g");
  field(40, "lestring16", "name", "%.2s");
  field(44, "ulequad", "next", "0x%llx");
  check(!magic.includes(">7\t"), "padding was emitted");
  check(magic.split("\n").length === 18 && magic.endsWith(">0\tubyte\tx"), "missing leaves or final empty rule");
  header.set("version", 1);
  check(header.toMagic() === magic, "assigned search values constrained the decoder");
  const aligned = new SearchPattern(program, "Aligned", { alignment: 4 }).toMagic();
  check(aligned.includes("7\tubyte\tx\tAligned") && aligned.includes(">4\tubelong\tx\tvalue=0x%x"), "alignment policy");
  check(new SearchPattern(program, "Array<u16, COUNT>").toMagic().includes(">2\tubeshort\tx\tvalues[1]=0x%x"), "template constants");
  check(new SearchPattern(program, "ns::Numbers").toMagic().includes(">2\tuleshort\tx\tvalues[1]=0x%x"), "namespace types");
  fails("BadWidth", "libmagic cannot decode field 'value'");
  fails("Half", "libmagic cannot decode field 'value'");
  fails("Bits", "libmagic cannot decode field 'value'");
  fails("Dynamic", "unset field");
  console.log("[test] Magic export OK");
}
