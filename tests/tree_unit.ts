import { compile, decodeType, BufferHost, dumpTree, toJson, patternColor } from "../lib/index";

export function testTree(): void {
  const check = (ok: boolean, msg: string): void => { if (!ok) throw new Error("tree: " + msg); };
  const program = compile(`
const u8 N = 2;
struct Inner { u16 word; } [[color("00FF00")]];
struct Header {
  u8 count [[color("FF0000"), comment("entry count")]];
  Inner inner [[name("Details"), tag(count)]];
  u8 data[count];
  padding[1];
  u8 secret [[hidden]];
  Inner closed [[sealed]];
} [[color("1144AA")]];
struct Array<T, auto Count> { T entries[Count]; };
Header unrelated @ 10000;
std::assert(false, "type decoder must not execute top-level statements");
fn main() { std::assert(false, "type decoder must not call main"); };
`);
  const data = new Uint8Array([99, 99, 2, 0x34, 0x12, 1, 2, 0, 0x78, 0x56, 3, 0]);
  const inst = decodeType(program, "Header", new BufferHost(data), 2);
  const root = inst.get("value")!;
  check(inst.patterns.length === 1 && root.offset === 2 && root.size === 9, "placed layout");
  check(inst.evaluateExpression("value.inner.word + 0") === 0x1234n, "decoded value");
  check(root.member("data")!.entryCount() === 2, "data-dependent array length");
  check(patternColor(root.member("data")!.entry(0)!) === "1144aa", "array color inheritance");
  check(patternColor(root.member("inner")!.member("word")!) === "00ff00", "member type color override");
  const json = toJson(inst, { base: 0x1000 })[0];
  check(json.addr === 0x1002 && json.color === "1144AA", "JSON address/color");
  check(json.children![0].comment === "entry count" && json.children![1].displayName === "Details", "JSON presentation metadata");
  check(json.children![1].attributes!.find((a) => a.name === "tag")!.args[0] === 2, "pattern-valued attribute serialization");
  check(json.children![2].entries![1].color === "1144AA", "JSON array entry color");
  const lines: string[] = [];
  dumpTree(inst, (line) => lines.push(line), { base: 0x1000 });
  const tree = lines.join("\n");
  check(tree.includes('value (Header) @ 0x00001002 size=9 [[color("1144AA")]]'), "root row");
  check(tree.includes('|- Details (Inner)') && tree.includes('|  `- word (u16) @ 0x00001003 = 4660 (0x1234)'), "nested tree");
  check(tree.includes('tag(2)') && tree.includes('comment("entry count")'), "tree attributes");
  check(!tree.includes("secret") && !tree.includes("word (u16) @ 0x00001009"), "hidden/sealed patterns");
  check(!tree.includes("\x1b"), "plain output contains ANSI escapes");
  const limited: string[] = [];
  dumpTree(inst, (line) => limited.push(line), { patterns: [root.member("data")!], maxEntries: 1, color: true });
  check(limited[0].includes("\x1b[38;2;17;68;170m") && limited[2] === "`- ... (1 more entries)", "colored/limited tree");
  inst.evaluateExpression("std::core::set_pattern_color(value.data, 0x00efcdab)");
  check(patternColor(root.member("data")!.entry(0)!) === "abcdef", "runtime ABGR color");
  check(toJson(inst)[0].children![2].color === "abcdef", "runtime color serialization");
  check(decodeType(program, "Array<u16, N>", new BufferHost(data)).patterns[0].size === 4, "template constants");
  const conflict = decodeType(compile("const u8 value = 2; struct H { u8 bytes[value]; };"), "H", new BufferHost(data));
  check(conflict.patterns[0].name === "value_" && conflict.patterns[0].size === 2, "root collides with a constant");
  for (const offset of [-1, 1.5, data.length + 1, Number.MAX_SAFE_INTEGER + 1]) {
    let failed = false;
    try { decodeType(program, "Header", new BufferHost(data), offset); } catch (e) {
      failed = e instanceof Error && e.message.includes("outside the data");
    }
    check(failed, "invalid offset " + offset);
  }
  console.log("[test] Address-bound trees OK");
}
