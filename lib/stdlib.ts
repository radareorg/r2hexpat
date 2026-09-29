/** stdlib.ts - built-in functions (the `builtin::std::*` namespace). */
import * as A from "./ast";
import { uintN, intN } from "./bigint";
import { Chr } from "./ast";
import type { PatternInstance } from "./evaluator";
import { NOT_FOUND, fmtFloat } from "./evaluator";
import { Pattern } from "./patterns";
import { BufferMemory } from "./memory";

type Fn = (ev: PatternInstance, args: any[], loc: A.Loc) => any;

function argc(ev: PatternInstance, name: string, args: any[], min: number, max = min, loc?: A.Loc): void {
  if (args.length < min || args.length > max) {
    const exp = min === max ? String(min) : min + ".." + max;
    ev.error("function '" + name + "' expects " + exp + " arguments, got " + args.length, loc);
  }
}

function toBytes(ev: PatternInstance, v: any): Uint8Array {
  if (v instanceof Pattern) return ev.readPatternBytes(v);
  if (typeof v === "string") { const b = new Uint8Array(v.length); for (let i = 0; i < v.length; i++) b[i] = v.charCodeAt(i) & 0xff; return b; }
  if (v instanceof Chr) return new Uint8Array([v.c & 0xff]);
  let n = uintN(128, ev.toInt(v));
  const b: number[] = [];
  do { b.push(Number(n & 0xffn)); n >>= 8n; } while (n > 0n);
  return new Uint8Array(b);
}

function readInt(ev: PatternInstance, args: any[], signed: boolean): bigint {
  const addr = Number(ev.toInt(args[0]));
  const size = Number(ev.toInt(args[1]));
  const endian = args.length > 2 ? ev.toInt(args[2]) : 0n; // 0 native, 1 big, 2 little
  const section = args.length > 3 ? ev.userSection(ev.toInt(args[3])) : ev.section;
  if (size < 1 || size > 16) ev.error("invalid read size " + size);
  const b = ev.mem(section).read(addr, size);
  const be = endian === 1n || (endian === 0n && ev.bigEndian);
  let v = 0n;
  if (be) for (let i = 0; i < size; i++) v = (v << 8n) | BigInt(b[i]);
  else for (let i = size - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
  return signed ? intN(size * 8, v) : v;
}

function section(ev: PatternInstance, v: any): BufferMemory {
  const m = ev.mem(ev.userSection(ev.toInt(v)));
  if (!(m instanceof BufferMemory)) ev.error("section is not writable");
  return m;
}

const math1 = (f: (x: number) => number): Fn => (ev, a) => f(ev.toFloat(ev.decay(a[0])));

const BUILTINS: Record<string, Fn> = {
  "std::assert": (ev, a, loc) => {
    argc(ev, "std::assert", a, 1, 2, loc);
    if (!ev.truthy(ev.decay(a[0]))) ev.error("assertion failed \"" + (a.length > 1 ? ev.toStr(ev.decay(a[1])) : "") + "\"", loc);
  },
  "std::assert_warn": (ev, a) => {
    if (!ev.truthy(ev.decay(a[0]))) ev.print("[WARN] assertion failed \"" + ev.toStr(ev.decay(a[1])) + "\"");
  },
  "std::print": (ev, a) => { ev.print(formatString(ev, ev.toStr(ev.decay(a[0])), a.slice(1))); },
  "std::format": (ev, a) => formatString(ev, ev.toStr(ev.decay(a[0])), a.slice(1)),
  "std::error": (ev, a, loc) => ev.error(ev.toStr(ev.decay(a[0])), loc),
  "std::warning": (ev, a) => { ev.print("[WARN] " + ev.toStr(ev.decay(a[0]))); },
  "std::env": (ev, a) => ev.error("environment variable '" + ev.toStr(a[0]) + "' is not defined"),
  "std::sizeof_pack": (_ev, a) => BigInt(a.length),

  "std::mem::size": (ev) => BigInt(ev.mem(ev.section).size()),
  "std::mem::base_address": () => 0n,
  "std::mem::eof": (ev) => ev.cursor >= ev.mem(ev.section).size(),
  "std::mem::read_unsigned": (ev, a) => readInt(ev, a, false),
  "std::mem::read_signed": (ev, a) => readInt(ev, a, true),
  "std::mem::read_string": (ev, a) => {
    const b = ev.mem(a.length > 2 ? ev.userSection(ev.toInt(a[2])) : ev.section).read(Number(ev.toInt(a[0])), Number(ev.toInt(a[1])));
    let s = ""; for (const x of b) s += String.fromCharCode(x);
    return s;
  },
  "std::mem::create_section": (ev, a) => BigInt(ev.createSection(ev.toStr(ev.decay(a[0])))),
  "std::mem::delete_section": (ev, a) => { const id = ev.userSection(ev.toInt(a[0])); if (id > 0) ev.sections.delete(id); },
  "std::mem::get_section_size": (ev, a) => BigInt(ev.mem(ev.userSection(ev.toInt(a[0]))).size()),
  "std::mem::set_section_size": (ev, a) => { section(ev, a[0]).resize(Number(ev.toInt(a[1]))); },
  "std::mem::copy_to_section": (ev, a) => {
    // (from_section, from_address, to_section, to_address, size)
    const src = ev.mem(ev.userSection(ev.toInt(a[0])));
    const bytes = src.read(Number(ev.toInt(a[1])), Number(ev.toInt(a[4])));
    section(ev, a[2]).write(Number(ev.toInt(a[3])), bytes);
  },
  "std::mem::copy_value_to_section": (ev, a) => {
    section(ev, a[1]).write(Number(ev.toInt(a[2])), toBytes(ev, ev.decay(a[0]) instanceof Pattern ? a[0] : ev.decay(a[0])));
  },
  "std::mem::current_bit_offset": () => 0n,

  "std::core::member_count": (ev, a) => {
    const p = a[0];
    if (!(p instanceof Pattern)) ev.error("member_count expects a pattern");
    if (p.kind === "string" || p.kind === "wstring") return BigInt(p.size / (p.kind === "wstring" ? 2 : 1));
    return BigInt(p.entryCount());
  },
  "std::core::has_member": (ev, a) => a[0] instanceof Pattern && !!a[0].member(ev.toStr(ev.decay(a[1]))),
  "std::core::formatted_value": (ev, a) => (a[0] instanceof Pattern ? ev.formatPattern(a[0]) : ev.toStr(a[0])),
  "std::core::is_valid_enum": (ev, a) => {
    const p = a[0];
    if (!(p instanceof Pattern) || !p.enumInfo) return false;
    return !ev.formatPattern(p).endsWith("::???");
  },
  "std::core::has_attribute": (ev, a) => a[0] instanceof Pattern && !!a[0].attr(ev.toStr(ev.decay(a[1]))),
  "std::core::get_attribute_argument": (ev, a) => {
    const at = a[0] instanceof Pattern ? a[0].attr(ev.toStr(ev.decay(a[1]))) : undefined;
    if (!at) return ev.error("pattern has no attribute '" + ev.toStr(a[1]) + "'");
    const i = a.length > 2 ? Number(ev.toInt(a[2])) : 0;
    return at.args[i];
  },
  "std::core::get_attribute_value": (ev, a) => BUILTINS["std::core::get_attribute_argument"](ev, a, ev.loc),
  "std::core::set_display_name": (ev, a) => { if (a[0] instanceof Pattern) a[0].name = ev.toStr(ev.decay(a[1])); },
  "std::core::set_pattern_comment": (ev, a) => { if (a[0] instanceof Pattern) a[0].comment = ev.toStr(ev.decay(a[1])); },
  "std::core::set_pattern_color": () => undefined,
  "std::core::set_endian": (ev, a) => { const e = ev.toInt(a[0]); ev.bigEndian = e === 1n; },
  "std::core::get_endian": (ev) => (ev.bigEndian ? 1n : 2n),
  "std::core::array_index": () => 0n,
  "std::core::execute_function": (ev, a, loc) => {
    const fn = ev.findFn(ev.toStr(ev.decay(a[0])));
    if (!fn) return ev.error("function '" + ev.toStr(a[0]) + "' does not exist", loc);
    return ev.callFn(fn, a.slice(1), loc);
  },

  "std::string::length": (ev, a) => BigInt(ev.toStr(ev.decay(a[0])).length),
  "std::string::at": (ev, a) => {
    const s = ev.toStr(ev.decay(a[0])), i = Number(ev.toInt(a[1]));
    if (i < 0 || i >= s.length) ev.error("string index out of bounds");
    return new Chr(s.charCodeAt(i));
  },
  "std::string::substr": (ev, a) => ev.toStr(ev.decay(a[0])).substr(Number(ev.toInt(a[1])), Number(ev.toInt(a[2]))),
  "std::string::parse_int": (ev, a) => {
    const s = ev.toStr(ev.decay(a[0])).trim(), base = a.length > 1 ? Number(ev.toInt(a[1])) : 10;
    const m = s.match(/^([+-]?)(0[xX])?([0-9a-zA-Z]+)/);
    if (!m) return 0n;
    const b = m[2] ? 16 : base;
    let v = 0n;
    for (const ch of m[3]) { const d = parseInt(ch, b); if (isNaN(d)) break; v = v * BigInt(b) + BigInt(d); }
    return m[1] === "-" ? -v : v;
  },
  "std::string::parse_float": (ev, a) => parseFloat(ev.toStr(ev.decay(a[0]))),

  "std::math::floor": math1(Math.floor),
  "std::math::ceil": math1(Math.ceil),
  "std::math::round": math1(Math.round),
  "std::math::trunc": math1(Math.trunc),
  "std::math::sqrt": math1(Math.sqrt),
  "std::math::cbrt": math1(Math.cbrt),
  "std::math::log10": math1(Math.log10),
  "std::math::log2": math1(Math.log2),
  "std::math::ln": math1(Math.log),
  "std::math::exp": math1(Math.exp),
  "std::math::sin": math1(Math.sin),
  "std::math::cos": math1(Math.cos),
  "std::math::tan": math1(Math.tan),
  "std::math::pow": (ev, a) => Math.pow(ev.toFloat(ev.decay(a[0])), ev.toFloat(ev.decay(a[1]))),
  "std::math::fmod": (ev, a) => ev.toFloat(ev.decay(a[0])) % ev.toFloat(ev.decay(a[1])),
};

export function callBuiltin(ev: PatternInstance, name: string, args: any[], loc: A.Loc): any {
  const f = BUILTINS[name];
  return f ? f(ev, args, loc) : NOT_FOUND;
}

/** fmt-style formatting: `{}`, `{0}`, `{:08X}`, `{:#x}`, `{:.2f}`, `{{`, `}}`. */
export function formatString(ev: PatternInstance, fmt: string, args: any[]): string {
  let out = "";
  let auto = 0;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c === "{" && fmt[i + 1] === "{") { out += "{"; i++; continue; }
    if (c === "}" && fmt[i + 1] === "}") { out += "}"; i++; continue; }
    if (c !== "{") { out += c; continue; }
    const end = fmt.indexOf("}", i);
    if (end < 0) ev.error("invalid format string: unmatched '{'");
    const spec = fmt.substring(i + 1, end);
    i = end;
    const colon = spec.indexOf(":");
    const idxs = colon < 0 ? spec : spec.substring(0, colon);
    const fs = colon < 0 ? "" : spec.substring(colon + 1);
    const idx = idxs === "" ? auto++ : parseInt(idxs, 10);
    if (idx >= args.length) ev.error("format argument index " + idx + " out of range");
    out += formatOne(ev, args[idx], fs);
  }
  return out;
}

function formatOne(ev: PatternInstance, v: any, spec: string): string {
  const m = spec.match(/^(?:(.)?([<>^]))?([+ -])?(#)?(0)?(\d+)?(?:\.(\d+))?([a-zA-Z])?$/);
  if (!m) ev.error("invalid format specifier '" + spec + "'");
  const [, fill, align, sign, alt, zero, width, prec, type] = m;
  if (v instanceof Pattern) {
    const d = ev.decay(v);
    v = d instanceof Pattern || v.enumInfo || (!type && (v.formatFn)) ? ev.formatPattern(v) : d;
  }
  let s: string;
  if (typeof v === "bigint" || typeof v === "boolean" && type || (v instanceof Chr && type && type !== "c")) {
    let n = typeof v === "bigint" ? v : v instanceof Chr ? BigInt(v.c) : v ? 1n : 0n;
    const neg = n < 0n;
    if (neg) n = -n;
    let body: string;
    switch (type) {
      case "x": body = n.toString(16); break;
      case "X": body = n.toString(16).toUpperCase(); break;
      case "b": case "B": body = n.toString(2); break;
      case "o": body = n.toString(8); break;
      case "c": body = String.fromCharCode(Number(n)); break;
      case "e": case "f": case "g": body = formatFloat(Number(n), type, prec); break;
      default: body = n.toString(10);
    }
    let prefix = neg ? "-" : sign === "+" ? "+" : sign === " " ? " " : "";
    if (alt) prefix += type === "x" ? "0x" : type === "X" ? "0X" : type === "b" ? "0b" : type === "B" ? "0B" : type === "o" ? "0" : "";
    if (zero && width && !align) body = body.padStart(Number(width) - prefix.length, "0");
    s = prefix + body;
  } else if (typeof v === "number") {
    s = formatFloat(v, type, prec);
    if (sign === "+" && v >= 0) s = "+" + s;
    if (zero && width && !align) s = (s[0] === "-" ? "-" + s.substr(1).padStart(Number(width) - 1, "0") : s.padStart(Number(width), "0"));
  } else {
    s = ev.toStr(v);
    if (prec) s = s.substr(0, Number(prec));
  }
  if (width && s.length < Number(width)) {
    const w = Number(width), f = fill || " ";
    const al = align || (typeof v === "string" || v instanceof Chr ? "<" : ">");
    const padn = w - s.length;
    if (al === "<") s = s + f.repeat(padn);
    else if (al === ">") s = f.repeat(padn) + s;
    else s = f.repeat(Math.floor(padn / 2)) + s + f.repeat(Math.ceil(padn / 2));
  }
  return s;
}

function formatFloat(v: number, type?: string, prec?: string): string {
  const p = prec !== undefined ? Number(prec) : undefined;
  switch (type) {
    case "f": case "F": return v.toFixed(p ?? 6);
    case "e": case "E": return v.toExponential(p ?? 6);
    case "a": case "A": return v.toString(16);
  }
  if (p !== undefined) return String(Number(v.toPrecision(Math.max(1, p))));
  return fmtFloat(v);
}
