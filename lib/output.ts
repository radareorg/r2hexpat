/** output.ts - host-independent serializations of an evaluated pattern tree. */
import { Chr } from "./ast";
import { Pattern, MAIN_SECTION } from "./patterns";
import type { PatternInstance } from "./evaluator";

export interface JsonOptions {
  base?: number;          // added to offsets to produce `addr` (e.g. r2's baddr)
  maxEntries?: number;    // cap array entries (default: all)
}

export interface PatternJson {
  name: string;
  type: string;
  kind: string;
  addr: number;
  offset: number;
  size: number;
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

/**
 * Walk the placed patterns depth first. `path` holds the member names from
 * the top-level pattern down (array entries use their index).
 * Return false from `visit` to skip the children of a pattern.
 */
export function walkPatterns(inst: PatternInstance, visit: (p: Pattern, path: string[]) => boolean | void): void {
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
  for (const p of inst.patterns) walk(p, [p.name]);
}
