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

/** Generic reflected/unreflected CRC (same parameters as wolv::hash::Crc). */
function crc(bits: number): Fn {
  return (ev, a) => {
    const bytes = toBytes(ev, a[0] instanceof Pattern ? a[0] : ev.decay(a[0]));
    const w = BigInt(bits), mask = (1n << w) - 1n, top = 1n << (w - 1n);
    const reflect = (v: bigint, n: number) => { let r = 0n; for (let i = 0; i < n; i++) { r = (r << 1n) | (v & 1n); v >>= 1n; } return r; };
    let v = ev.toInt(ev.decay(a[1])) & mask;
    const poly = ev.toInt(ev.decay(a[2])) & mask, xorout = ev.toInt(ev.decay(a[3])) & mask;
    const refIn = ev.truthy(ev.decay(a[4])), refOut = ev.truthy(ev.decay(a[5]));
    for (const b0 of bytes) {
      const b = BigInt(refIn ? Number(reflect(BigInt(b0), 8)) : b0);
      v ^= b << (w - 8n);
      for (let i = 0; i < 8; i++) v = v & top ? ((v << 1n) ^ poly) & mask : (v << 1n) & mask;
    }
    if (refOut) v = reflect(v, bits);
    return (v ^ xorout) & mask;
  };
}

function findSequence(ev: PatternInstance, a: any[], seq: Uint8Array): bigint {
  const occ = Number(ev.toInt(ev.decay(a[0])));
  const from = Number(ev.toInt(ev.decay(a[1])));
  const mem = ev.mem(ev.section);
  const to = Math.min(Number(ev.toInt(ev.decay(a[2]))), mem.size());
  if (!seq.length) return -1n;
  const data = mem.read(from, Math.max(0, to - from));
  let n = 0;
  outer: for (let i = 0; i + seq.length <= data.length; i++) {
    for (let j = 0; j < seq.length; j++) if (data[i + j] !== seq[j]) continue outer;
    if (n++ === occ) return BigInt(from + i);
  }
  return -1n;
}

/** std::time::Time packed into a u128 (sec, min, hour, mday, mon, s16 year, wday, u16 yday, isdst). */
function packTime(d: Date, utc: boolean): bigint {
  const g = (l: string) => (d as any)["get" + (utc ? "UTC" : "") + l]();
  const start = utc ? Date.UTC(d.getUTCFullYear(), 0, 1) : new Date(d.getFullYear(), 0, 1).getTime();
  const yday = Math.floor((d.getTime() - start) / 86400000);
  const bytes = [g("Seconds"), g("Minutes"), g("Hours"), g("Date"), g("Month"), (g("FullYear") - 1900) & 0xff, ((g("FullYear") - 1900) >> 8) & 0xff, g("Day"), yday & 0xff, yday >> 8, 0];
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

function strftime(fmt: string, d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const map: Record<string, () => string> = {
    Y: () => String(d.getUTCFullYear()), y: () => p2(d.getUTCFullYear() % 100), m: () => p2(d.getUTCMonth() + 1),
    d: () => p2(d.getUTCDate()), e: () => String(d.getUTCDate()).padStart(2, " "), H: () => p2(d.getUTCHours()),
    M: () => p2(d.getUTCMinutes()), S: () => p2(d.getUTCSeconds()), A: () => days[d.getUTCDay()], a: () => days[d.getUTCDay()].slice(0, 3),
    B: () => months[d.getUTCMonth()], b: () => months[d.getUTCMonth()].slice(0, 3), p: () => (d.getUTCHours() < 12 ? "AM" : "PM"),
    F: () => map.Y() + "-" + map.m() + "-" + map.d(), T: () => map.H() + ":" + map.M() + ":" + map.S(),
    c: () => map.a() + " " + map.b() + " " + map.e() + " " + map.T() + " " + map.Y(), "%": () => "%",
  };
  return fmt.replace(/%([a-zA-Z%])/g, (m, c) => (map[c] ? map[c]() : m));
}

function unpackTime(v: bigint): Date {
  const b: number[] = [];
  for (let i = 0; i < 11; i++) { b.push(Number(v & 0xffn)); v >>= 8n; }
  const year = ((b[5] | (b[6] << 8)) << 16 >> 16) + 1900;
  return new Date(Date.UTC(year, b[4], b[3], b[2], b[1], b[0]));
}

let rngState = 0x2545f491;
function rand(): number {
  // xorshift32, deterministic after set_seed
  rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5;
  return (rngState >>> 0) / 4294967296;
}

const fileFn: Fn = (ev, _a, loc) => ev.error("std::file functions are not supported (no filesystem access)", loc);

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
  "std::mem::find_sequence_in_range": (ev, a) => findSequence(ev, a, new Uint8Array(a.slice(3).map((x) => {
    const b = ev.toInt(ev.decay(x));
    if (b < 0n || b > 0xffn) ev.error("invalid byte value " + b.toString(16));
    return Number(b);
  }))),
  "std::mem::find_string_in_range": (ev, a) => findSequence(ev, a, toBytes(ev, ev.toStr(ev.decay(a[3])))),
  "std::mem::read_bits": (ev, a) => {
    const byteOff = Number(ev.toInt(ev.decay(a[0]))), bitOff = Number(ev.toInt(ev.decay(a[1]))), n = Number(ev.toInt(ev.decay(a[2])));
    const nb = Math.ceil((bitOff + n) / 8);
    const bytes = ev.mem(ev.section).read(byteOff, nb);
    let v = 0n;
    for (let i = 0; i < n; i++) {
      const k = bitOff + i;
      const bit = ev.bigEndian ? (bytes[k >> 3] >> (7 - (k & 7))) & 1 : (bytes[k >> 3] >> (k & 7)) & 1;
      if (ev.bigEndian) v = (v << 1n) | BigInt(bit); else v |= BigInt(bit) << BigInt(i);
    }
    return v;
  },

  "std::hash::crc8": crc(8),
  "std::hash::crc16": crc(16),
  "std::hash::crc32": crc(32),
  "std::hash::crc64": crc(64),

  "std::time::epoch": () => BigInt(Math.floor(Date.now() / 1000)),
  "std::time::to_local": (ev, a) => packTime(new Date(Number(ev.toInt(ev.decay(a[0]))) * 1000), false),
  "std::time::to_utc": (ev, a) => packTime(new Date(Number(ev.toInt(ev.decay(a[0]))) * 1000), true),
  "std::time::format": (ev, a) => strftime(ev.toStr(ev.decay(a[0])), unpackTime(ev.toInt(ev.decay(a[1])))),

  "std::random::set_seed": (ev, a) => { rngState = Number(ev.toInt(ev.decay(a[0])) & 0xffffffffn) || 1; },
  "std::random::generate": (ev, a) => {
    // (distribution, param1, param2): 0 uniform int, 1 uniform real, others fall back to uniform real
    const kind = Number(ev.toInt(ev.decay(a[0])));
    const lo = a.length > 1 ? ev.toFloat(ev.decay(a[1])) : 0, hi = a.length > 2 ? ev.toFloat(ev.decay(a[2])) : 1;
    if (kind === 0) return BigInt(Math.floor(lo + rand() * (hi - lo + 1)));
    return lo + rand() * (hi - lo);
  },

  "std::core::set_pattern_palette_colors": () => undefined,
  "std::core::reset_pattern_palette": () => undefined,
  "std::file::open": fileFn, "std::file::close": fileFn, "std::file::read": fileFn, "std::file::write": fileFn,
  "std::file::seek": fileFn, "std::file::size": fileFn, "std::file::resize": fileFn, "std::file::flush": fileFn,
  "std::file::remove": fileFn, "std::file::create_directories": fileFn,

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
  "std::core::array_index": (ev) => ev.arrayIndex,
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
  "std::math::log": math1(Math.log),
  "std::math::asin": math1(Math.asin),
  "std::math::acos": math1(Math.acos),
  "std::math::atan": math1(Math.atan),
  "std::math::atan2": (ev, a) => Math.atan2(ev.toFloat(ev.decay(a[0])), ev.toFloat(ev.decay(a[1]))),
  "std::math::sinh": math1(Math.sinh),
  "std::math::cosh": math1(Math.cosh),
  "std::math::tanh": math1(Math.tanh),
  "std::math::asinh": math1(Math.asinh),
  "std::math::acosh": math1(Math.acosh),
  "std::math::atanh": math1(Math.atanh),
  "std::math::accumulate": (ev, a) => {
    // (start, end, valueSize, section, operation: 0 add 1 mul 2 modulo 3 min 4 max, endian)
    const start = Number(ev.toInt(ev.decay(a[0]))), end = Number(ev.toInt(ev.decay(a[1])));
    const size = Number(ev.toInt(ev.decay(a[2])));
    const section = a.length > 3 ? ev.userSection(ev.toInt(ev.decay(a[3]))) : ev.section;
    const op = a.length > 4 ? Number(ev.toInt(ev.decay(a[4]))) : 0;
    const endian = a.length > 5 ? ev.toInt(ev.decay(a[5])) : 0n;
    const be = endian === 1n || (endian === 0n && ev.bigEndian);
    const bytes = ev.mem(section).read(start, Math.max(0, end - start));
    let acc = op === 1 ? 1n : 0n;
    let first = true;
    for (let i = 0; i + size <= bytes.length; i += size) {
      let v = 0n;
      if (be) for (let k = 0; k < size; k++) v = (v << 8n) | BigInt(bytes[i + k]);
      else for (let k = size - 1; k >= 0; k--) v = (v << 8n) | BigInt(bytes[i + k]);
      switch (op) {
        case 1: acc *= v; break;
        case 2: acc = v === 0n ? acc : acc % v; break;
        case 3: acc = first || v < acc ? v : acc; break;
        case 4: acc = first || v > acc ? v : acc; break;
        default: acc += v;
      }
      first = false;
    }
    return acc;
  },
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
    // arguments decay like rvalues: scalars and transformed patterns become their
    // value, enums and plain composites are rendered (which applies [[format]])
    const d = ev.decay(v);
    v = d instanceof Pattern || v.enumInfo ? ev.formatPattern(v) : d;
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
