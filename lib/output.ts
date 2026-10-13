/** output.ts - host-independent serializations of an evaluated pattern tree. */
import { Chr } from "./ast";
import { Pattern, MAIN_SECTION } from "./patterns";
import type { PatternInstance } from "./evaluator";

export interface JsonOptions {
  base?: number;          // added to offsets to produce `addr` (e.g. r2's baddr)
  maxEntries?: number;    // cap array entries (default: all)
}

export interface TreeOptions extends JsonOptions {
  color?: boolean;        // color rows with ANSI truecolor escapes (default: off)
  patterns?: Pattern[];   // selected roots (default: all placed patterns)
}

export interface PatternJson {
  name: string;
  type: string;
  kind: string;
  addr: number;
  offset: number;
  size: number;
  displayName?: string;
  color?: string;
  comment?: string;
  attributes?: { name: string; args: any[] }[];
  local?: boolean;
  section?: number;
  bits?: number;
  bitOffset?: number;
  value?: any;
  repr?: string;
  children?: PatternJson[];
  entries?: PatternJson[];
  count?: number;
  pointee?: PatternJson;
}

/** JSON-safe scalar: integers beyond 2^53 become decimal strings. */
export function jsonValue(v: any): any {
  if (typeof v === "bigint") return v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v.toString();
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (v instanceof Chr) return v.c;
  if (typeof v === "string" || typeof v === "boolean" || v === null) return v;
  return undefined;
}

export function patternToJson(inst: PatternInstance, p: Pattern, opts: JsonOptions = {}, name = p.name): PatternJson {
  const j: PatternJson = {
    name,
    type: p.typeName,
    kind: p.kind,
    addr: (opts.base || 0) + p.offset,
    offset: p.offset,
    size: p.size,
  };
  if (p.local) j.local = true;
  if (p.displayName !== undefined) j.displayName = p.displayName;
  if (p.getColor() !== undefined) j.color = p.getColor();
  if (p.comment !== undefined) j.comment = p.comment;
  if (p.attrs && p.attrs.length) j.attributes = attributes(inst, p);
  if (p.section !== MAIN_SECTION && !p.local) j.section = p.section;
  if (p.kind === "bitfield_field") { j.bits = p.bits; j.bitOffset = p.bitPos % 8; }
  if (p.kind === "array") {
    const n = p.entryCount();
    const max = opts.maxEntries !== undefined ? Math.min(n, opts.maxEntries) : n;
    j.count = n;
    j.entries = [];
    for (let i = 0; i < max; i++) j.entries.push(patternToJson(inst, p.entry(i)!, opts, "[" + i + "]"));
  } else if (p.kind === "pointer") {
    j.value = jsonValue(inst.value(p));
    if (p.pointee) j.pointee = patternToJson(inst, p.pointee, opts);
  } else if (p.isComposite()) {
    j.children = (p.children || []).map((c) => patternToJson(inst, c, opts));
    if (p.formatFn || p.transformFn) j.repr = inst.formatPattern(p);
  } else if (p.kind !== "padding") {
    j.value = jsonValue(inst.value(p));
    const repr = inst.formatPattern(p);
    const plain = typeof j.value === "string" ? j.value : String(j.value);
    if (repr !== plain) j.repr = repr;
  }
  return j;
}

/** All top-level placed patterns of an instance as JSON-ready objects. */
export function toJson(inst: PatternInstance, opts: JsonOptions = {}): PatternJson[] {
  return inst.patterns.filter((p) => !p.hidden).map((p) => patternToJson(inst, p, opts));
}

/** Evaluated, JSON-safe attribute arguments, including pattern-valued arguments. */
function attributes(inst: PatternInstance, p: Pattern): { name: string; args: any[] }[] {
  return (p.attrs || []).map((a) => ({ name: a.name, args: a.args.map((v) => {
    const value = inst.decay(v);
    return value instanceof Pattern ? inst.toStr(value) : jsonValue(value);
  }) }));
}

/** Hexpat's RRGGBB colors in a form usable by ANSI and r2's rgb: syntax. */
export function patternColor(p: Pattern): string | undefined {
  const m = (p.getColor() || "").match(/^(?:#|0x|rgb:)?([0-9a-f]{6})$/i);
  return m ? m[1].toLowerCase() : undefined;
}

/** Draw a tree with values, addresses and evaluated presentation attributes. */
export function dumpTree(inst: PatternInstance, print: (s: string) => void, opts: TreeOptions = {}): void {
  const walk = (p: Pattern, prefix: string, branch: string): void => {
    const attrs = attributes(inst, p).filter((a) => !["color", "comment", "name"].includes(a.name));
    const presentation: [string, string | undefined][] = [["color", p.getColor()], ["comment", p.comment], ["name", p.displayName]];
    for (const [name, value] of presentation) {
      if (value !== undefined) attrs.push({ name, args: [value] });
    }
    let line = inst.describePattern(p, opts.base || 0);
    if (attrs.length) line += " [[" + attrs.map((a) => a.name + (a.args.length ? "(" +
      a.args.map((v) => JSON.stringify(v) || "null").join(", ") + ")" : "")).join(", ") + "]]";
    const rgb = opts.color ? patternColor(p) : undefined;
    if (rgb) line = "\x1b[38;2;" + [0, 2, 4].map((i) => parseInt(rgb.substring(i, i + 2), 16)).join(";") + "m" + line + "\x1b[0m";
    print(prefix + branch + line);
    if (p.sealed) return;
    let children: Pattern[] = [];
    let omitted = 0;
    if (p.kind === "pointer") children = p.pointee ? [p.pointee] : [];
    else if (p.kind === "array") {
      const n = p.entryCount(), max = opts.maxEntries === undefined ? n : Math.min(n, opts.maxEntries);
      for (let i = 0; i < max; i++) children.push(p.entry(i)!);
      omitted = n - max;
    } else if (p.isComposite()) children = p.children || [];
    children = children.filter((c) => !c.hidden);
    const next = prefix + (branch ? branch === "`- " ? "   " : "|  " : "");
    children.forEach((c, i) => walk(c, next, i === children.length - 1 && !omitted ? "`- " : "|- "));
    if (omitted) print(next + "`- ... (" + omitted + " more entries)");
  };
  for (const p of opts.patterns || inst.patterns) if (!p.hidden) walk(p, "", "");
}

/**
 * Walk the placed patterns depth first. `path` holds the member names from
 * the top-level pattern down (array entries use their index).
 * Return false from `visit` to skip the children of a pattern.
 */
export function walkPatterns(inst: PatternInstance, visit: (p: Pattern, path: string[]) => boolean | void, patterns = inst.patterns): void {
  const walk = (p: Pattern, path: string[]) => {
    if (p.hidden) return;
    if (visit(p, path) === false) return;
    if (p.kind === "pointer") {
      if (p.pointee) walk(p.pointee, path.concat("deref"));
    } else if (p.kind === "array") {
      const n = p.entryCount();
      for (let i = 0; i < n; i++) walk(p.entry(i)!, path.concat(String(i)));
    } else if (p.isComposite() && !p.sealed) {
      for (const c of p.children || []) walk(c, path.concat(c.name));
    }
  };
  for (const p of patterns) walk(p, [p.name]);
}
