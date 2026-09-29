/// <reference path="./globals.d.ts" />
/**
 * evaluator.ts - runtime of the ImHex pattern language.
 *
 * Values are bigint (integers), number (floats), boolean, string (byte
 * strings), Chr (characters), null, Pattern (placed or local variables) and
 * Pack (function parameter packs). Local variables live in a zeroed heap
 * section so that unions and aggregate copies behave like real memory.
 */
import * as A from "./ast";
import { uintN, intN } from "./bigint";
import { Chr } from "./ast";
import { PatternError } from "./lexer";
import { parseExpression } from "./parser";
import { Pattern, PKind, EnumInfo, BitMode, MAIN_SECTION, HEAP_SECTION } from "./patterns";
import { Memory, BufferMemory, SparseMemory } from "./memory";
import { callBuiltin, formatString } from "./stdlib";

export { Pattern };

export class Pack { constructor(public items: any[]) {} }
export class TypeValue { constructor(public t: CType) {} }

/** A resolved (concrete) type. */
export type CType =
  | { t: "builtin"; name: string; size: number; be?: boolean; attrs?: A.Attr[] }
  | { t: "decl"; decl: A.StructDecl | A.EnumDecl | A.BitfieldDecl | A.ImportedDecl; args: any[]; binds: Map<string, any>; display: string; be?: boolean; attrs?: A.Attr[] }
  | { t: "host"; name: string; args: any[]; display: string; be?: boolean; attrs?: A.Attr[] };

interface Var { v: any; isConst?: boolean; binding?: boolean; }

class Scope {
  vars = new Map<string, Var>();
  constructor(public parent?: Scope) {}
  find(name: string): Var | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const v = s.vars.get(name);
      if (v) return v;
    }
    return undefined;
  }
}

interface Frame {
  scope: Scope;               // innermost lexical scope
  root: Scope;                // frame root scope (struct members, fn params)
  pattern?: Pattern;          // struct/union/bitfield being built
  kind: "global" | "struct" | "bitfield" | "fn" | "alias";
  ns: string[];
  binds: Map<string, any>;    // template parameter bindings (CType or value)
  bit?: { pos: number; mode: BitMode }; // bitfield bit cursor
  placeBase?: number;         // imported type: its own `@` placements are relative to the instance
}

class Signal { constructor(public kind: "break" | "continue" | "return", public value?: any) {} }

export interface HostHooks {
  functions?: Record<string, (args: any[], ev: PatternInstance) => any>;
  types?: Record<string, (args: any[], ev: PatternInstance) => { kind: PKind; size: number }>;
  pragmas?: Record<string, (value: string) => boolean>;
  inVariables?: Record<string, any>;
}

const INT_TYPES: Record<string, number> = {
  u8: 1, u16: 2, u24: 3, u32: 4, u48: 6, u64: 8, u96: 12, u128: 16,
  s8: 1, s16: 2, s24: 3, s32: 4, s48: 6, s64: 8, s96: 12, s128: 16,
  i8: 1, i16: 2, i24: 3, i32: 4, i48: 6, i64: 8, i96: 12, i128: 16,
};
const OTHER_TYPES: Record<string, number> = {
  float: 4, double: 8, float16: 2, char: 1, char16: 2, bool: 1, padding: 1, str: 0, auto: 0,
};
const MASK128 = (1n << 128n) - 1n;
const MAX_DEPTH = 256;

export function isBuiltinType(n: string): boolean { return n in INT_TYPES || n in OTHER_TYPES; }

export class PatternInstance {
  cursor = 0;
  patterns: Pattern[] = [];                  // top-level placed patterns
  variables = new Map<string, Pattern>();   // top-level lookup by name
  output: string[] = [];
  bigEndian = false;
  sections = new Map<number, Memory>();
  heap = new SparseMemory();
  loc: A.Loc = { line: 0, col: 0, src: "" };
  private sectionStack: number[] = [MAIN_SECTION];
  private nextSection = 1;
  private frames: Frame[] = [];
  private global!: Frame;
  private types = new Map<string, A.TypeDecl>();
  private fns = new Map<string, A.FnDecl>();
  private enums = new Map<A.EnumDecl, EnumInfo>();
  private endianStack: (boolean | undefined)[] = [];
  private depth = 0;
  arrayLimit = 0x10000;       // 0 disables the limit (like ImHex)
  patternLimit = 0x100000;
  evalDepth = MAX_DEPTH;
  arrayIndex = 0n;            // std::core::array_index()
  pendingCtrl?: "break" | "continue" | "return"; // control flow leaving a struct: arrays consume break/continue,
  private lastCtrl?: "break" | "continue" | "return"; // a return ends the whole evaluation
  private importsRegistered = new Set<A.ImportedDecl>();
  private patternCount = 0;
  private printFn: (s: string) => void;

  constructor(private program: A.Program, private data: Memory, private host: HostHooks = {}, print?: (s: string) => void) {
    this.sections.set(MAIN_SECTION, data);
    this.sections.set(HEAP_SECTION, this.heap);
    this.printFn = print || ((s: string) => console.log(s));
  }

  // ------------------------------------------------------------------ errors
  error(msg: string, loc: A.Loc = this.loc): never { throw new PatternError(msg, loc); }

  // ------------------------------------------------------------------ setup
  eval(): void {
    for (const [k, v] of this.program.pragmas) this.pragma(k, v);
    this.register(this.program.body);
    const root = new Scope();
    this.global = { scope: root, root, kind: "global", ns: [], binds: new Map() };
    this.frames = [this.global];
    try {
      this.execBlock(this.program.body, this.global);
    } catch (e) {
      if (e instanceof Signal) {
        if (e.kind !== "return") this.error(e.kind + " statement outside of a loop");
        return;
      }
      throw e;
    }
    const main = this.fns.get("main");
    if (main) this.callFn(main, [], main.loc);
  }

  private pragma(key: string, value: string): void {
    const h = this.host.pragmas && this.host.pragmas[key];
    if (h && !h(value)) this.error("invalid value for pragma '" + key + "': '" + value + "'", { line: 0, col: 0, src: "" });
    switch (key) {
      case "endian":
        if (value === "big") this.bigEndian = true;
        else if (value === "little" || value === "native") this.bigEndian = false;
        break;
      case "array_limit": this.arrayLimit = parseInt(value); break;
      case "pattern_limit": this.patternLimit = parseInt(value); break;
      case "eval_depth": this.evalDepth = parseInt(value); break;
    }
  }

  /** Collect type and function declarations (types are hoisted). */
  private register(body: A.Stmt[], lenient = false): void {
    for (const s of body) {
      switch (s.s) {
        case "struct": case "union": case "enum": case "bitfield": case "using": case "imported": {
          const prev = this.types.get(s.name);
          // a forward declaration never replaces a definition
          if (prev && s.s === "using" && !s.type && !(prev.s === "using" && !prev.type)) break;
          this.types.set(s.name, s);
          break;
        }
        case "fn":
          if (this.fns.has(s.name) && !lenient) this.error("redefinition of function '" + s.name + "'", s.loc);
          this.fns.set(s.name, s);
          break;
      }
    }
  }

  get curFrame(): Frame { return this.frames[this.frames.length - 1]; }
  get section(): number { return this.sectionStack[this.sectionStack.length - 1]; }
  private isGlobal(): boolean { return this.curFrame === this.global; }

  mem(section: number): Memory {
    const m = this.sections.get(section);
    if (!m) this.error("invalid section id " + section);
    return m;
  }

  // ------------------------------------------------------------------ sections
  createSection(name: string): number {
    const id = this.nextSection++;
    this.sections.set(id, new BufferMemory(name));
    return id;
  }
  /** Map a user-visible section id to an internal one. */
  userSection(v: bigint): number {
    if (v === 0xFFFFFFFFFFFFFFFFn) return this.section;
    if (v >= 0xFFFFFFFFFFFFFFF0n) this.error("access to internal section 0x" + v.toString(16) + " is not allowed");
    const n = Number(v);
    if (!this.sections.has(n)) this.error("invalid section id " + n);
    return n;
  }

  // ------------------------------------------------------------------ names
  private lookupName<T>(map: Map<string, T>, name: string, ns: string[]): T | undefined {
    for (let n = ns.length; n > 0; n--) {
      const v = map.get(ns.slice(0, n).join("::") + "::" + name);
      if (v) return v;
    }
    return map.get(name);
  }
  findType(name: string): A.TypeDecl | undefined { return this.lookupName(this.types, name, this.curFrame.ns); }
  findFn(name: string): A.FnDecl | undefined { return this.lookupName(this.fns, name, this.curFrame.ns); }

  // ------------------------------------------------------------------ types
  resolveType(ta: A.TypeApp): CType {
    const f = this.curFrame;
    const be = ta.endian === "be" ? true : ta.endian === "le" ? false : undefined;
    const withEndian = (c: CType): CType => (be === undefined ? c : { ...c, be } as CType);
    for (let fr: Frame | undefined = f; fr; fr = undefined) {
      if (fr.binds.has(ta.name)) {
        const b = fr.binds.get(ta.name);
        if (b instanceof TypeValue) return withEndian(b.t);
      }
    }
    if (isBuiltinType(ta.name)) {
      let name = ta.name;
      if (name[0] === "i") name = "s" + name.substr(1);
      return { t: "builtin", name, size: INT_TYPES[ta.name] ?? OTHER_TYPES[ta.name], be };
    }
    const decl = this.findType(ta.name);
    if (!decl) {
      if (this.host.types && this.host.types[ta.name]) {
        const args = (ta.args || []).map((a) => this.templateArg(a, true));
        return { t: "host", name: ta.name, args, display: ta.name, be };
      }
      this.error("unknown type '" + ta.name + "'", ta.loc);
    }
    if (decl.s === "fn") this.error("'" + ta.name + "' is a function, not a type", ta.loc);
    const params = decl.tparams || [];
    const rawArgs = ta.args || [];
    if (rawArgs.length !== params.length) this.error("type '" + decl.name + "' expects " + params.length + " template arguments, got " + rawArgs.length, ta.loc);
    const args = params.map((p, i) => this.templateArg(rawArgs[i], p.isValue));
    const binds = new Map<string, any>();
    params.forEach((p, i) => binds.set(p.name, args[i]));
    if (decl.s === "using") {
      if (!decl.type) this.error("type '" + decl.name + "' is declared but never defined", ta.loc);
      const fr: Frame = { scope: new Scope(), root: new Scope(), kind: "alias", ns: decl.ns, binds };
      fr.scope = fr.root;
      params.forEach((p, i) => { if (p.isValue) fr.root.vars.set(p.name, { v: args[i] }); });
      this.frames.push(fr);
      let r: CType;
      try { r = withEndian(this.resolveType(decl.type)); } finally { this.frames.pop(); }
      // attributes on an alias (`using X = T [[format(...)]]`) apply to its instances
      if (decl.attrs) r = { ...r, attrs: (r.attrs || []).concat(decl.attrs) } as CType;
      return r;
    }
    const display = params.length ? decl.name + "<" + args.map((a) => this.displayArg(a)).join(", ") + ">" : decl.name;
    return { t: "decl", decl: decl as any, args, binds, display, be };
  }

  private templateArg(a: A.TypeApp | A.Expr, isValue: boolean): any {
    const isTypeApp = !(a as any).k;
    if (!isValue) {
      if (isTypeApp) return new TypeValue(this.resolveType(a as A.TypeApp));
      const e = a as A.Expr;
      if (e.k === "id") return new TypeValue(this.resolveType({ name: e.name, loc: e.loc }));
      if (e.k === "type") return new TypeValue(this.resolveType(e.t));
      this.error("expected a type as template argument", e.loc);
    }
    let v: any;
    if (isTypeApp) v = this.evalExpr({ k: "id", name: (a as A.TypeApp).name, loc: (a as A.TypeApp).loc });
    else v = this.evalExpr(a as A.Expr);
    if (v instanceof Pattern && !v.isComposite()) v = this.value(v);
    return v;
  }

  private displayArg(a: any): string {
    if (a instanceof TypeValue) return this.typeDisplay(a.t);
    if (a instanceof Pattern) return this.formatPattern(a, true);
    if (typeof a === "string") return JSON.stringify(a);
    return this.toStr(a);
  }

  typeDisplay(c: CType): string {
    return c.t === "builtin" ? c.name : c.display;
  }

  /** Static size of a type (instantiated on the heap with zeroed data). */
  sizeOfType(c: CType): number {
    if (c.t === "builtin") return c.size;
    const save = this.cursor;
    const hsave = this.heap.top;
    this.sectionStack.push(HEAP_SECTION);
    this.cursor = this.heap.top;
    try {
      const p = this.create(c, "");
      return p.size;
    } finally {
      this.sectionStack.pop();
      this.cursor = save;
      this.heap.top = hsave;
    }
  }

  private enumInfo(d: A.EnumDecl): EnumInfo {
    let info = this.enums.get(d);
    if (!info) {
      info = { name: d.name, entries: [] };
      this.enums.set(d, info);
      let next = 0n;
      const fr: Frame = { scope: new Scope(), root: new Scope(), kind: "alias", ns: d.ns, binds: new Map() };
      this.frames.push(fr);
      try {
        for (const e of d.entries) {
          const lo = e.value ? this.toInt(this.evalExpr(e.value)) : next;
          const hi = e.end ? this.toInt(this.evalExpr(e.end)) : lo;
          info.entries.push({ name: e.name, lo, hi });
          next = hi + 1n;
        }
      } finally { this.frames.pop(); }
    }
    return info;
  }

  private enumConstant(name: string): bigint | undefined {
    const k = name.lastIndexOf("::");
    if (k < 0) return undefined;
    let d = this.findType(name.substring(0, k));
    if (d && d.s === "using" && d.type && !d.tparams) {
      try {
        const c = this.resolveType({ name: name.substring(0, k), loc: this.loc });
        if (c.t === "decl") d = c.decl as A.TypeDecl;
      } catch (e) { return undefined; }
    }
    if (!d || d.s !== "enum") return undefined;
    const c = name.substring(k + 2);
    for (const e of this.enumInfo(d).entries) if (e.name === c) return e.lo;
    return undefined;
  }

  // ------------------------------------------------------------------ patterns
  private endian(c: CType): boolean {
    if (c.be !== undefined) return c.be;
    for (let i = this.endianStack.length - 1; i >= 0; i--) if (this.endianStack[i] !== undefined) return this.endianStack[i]!;
    return this.bigEndian;
  }

  private newPattern(kind: PKind, typeName: string, size: number, be: boolean): Pattern {
    if (++this.patternCount > this.patternLimit && this.patternLimit > 0) this.error("pattern count exceeded set limit of " + this.patternLimit);
    const p = new Pattern(kind, typeName);
    p.section = this.section;
    p.offset = this.cursor;
    p.size = size;
    p.be = be;
    p.local = this.section === HEAP_SECTION;
    return p;
  }

  /** Create a pattern of type `c` at the cursor and advance the cursor. */
  create(c: CType, name: string, attrs?: A.Attr[]): Pattern {
    let p: Pattern;
    if (c.t === "builtin") {
      p = this.createBuiltin(c);
    } else if (c.t === "host") {
      const spec = this.host.types![c.name](c.args, this);
      p = this.newPattern(spec.kind, c.display, spec.size, this.endian(c));
      this.cursor += spec.size;
    } else {
      this.endianStack.push(c.be);
      try {
        const d = c.decl;
        if (d.s === "enum") {
          const ut = this.resolveInFrame(d.underlying, d.ns);
          if (ut.t === "builtin") {
            p = this.newPattern("enum", c.display, ut.size, this.endian(ut));
            if (ut.name[0] === "s") p.fieldKind = "signed";
            this.cursor += ut.size;
          } else {
            // any integer-valued type works as underlying type (e.g. a LEB128 with a transform)
            const start = this.cursor;
            const inner = this.create(ut, "");
            p = this.newPattern("enum", c.display, inner.size, inner.be);
            p.offset = start;
            p.inner = inner;
          }
          p.enumInfo = this.enumInfo(d);
        } else if (d.s === "bitfield") {
          p = this.createBitfield(c, d);
        } else if (d.s === "imported") {
          // an imported file keeps its own `#pragma endian`
          let be: boolean | undefined;
          for (const [k, v] of d.program.pragmas) if (k === "endian") be = v === "big" ? true : v === "little" ? false : be;
          if (!this.importsRegistered.has(d)) { this.importsRegistered.add(d); this.register(d.program.body, true); }
          this.endianStack.push(c.be !== undefined ? c.be : be);
          try { p = this.createStruct(c, { s: "struct", loc: d.loc, name: d.name, ns: [], body: d.program.body }, this.cursor); }
          finally { this.endianStack.pop(); }
          p.imported = true;
        } else {
          p = this.createStruct(c, d);
        }
      } finally { this.endianStack.pop(); }
    }
    p.name = name;
    // structs and bitfields apply their type attributes inside their own scope
    if (!(c.t === "decl" && c.decl.s !== "enum")) this.applyTypeAttrs(p, c);
    if (attrs) this.applyAttrs(p, attrs);
    return p;
  }

  private resolveInFrame(ta: A.TypeApp, ns: string[]): CType {
    const fr: Frame = { scope: new Scope(), root: new Scope(), kind: "alias", ns, binds: new Map() };
    this.frames.push(fr);
    try { return this.resolveType(ta); } finally { this.frames.pop(); }
  }

  private createBuiltin(c: { t: "builtin"; name: string; size: number; be?: boolean }): Pattern {
    const n = c.name;
    const be = this.endian(c);
    let kind: PKind;
    if (n in INT_TYPES) kind = n[0] === "s" ? "signed" : "unsigned";
    else if (n === "float" || n === "double" || n === "float16") kind = "float";
    else if (n === "char") kind = "char";
    else if (n === "char16") kind = "char16";
    else if (n === "bool") kind = "bool";
    else if (n === "padding") kind = "padding";
    else if (n === "str") {
      const p = this.newPattern("string", "str", 0, be);
      p.hasOverride = true;
      p.override = "";
      return p;
    } else return this.error("'auto' can only be used with parameters and initialized variables");
    const p = this.newPattern(kind, n, c.size, be);
    this.cursor += c.size;
    return p;
  }

  private pushFrame(kind: Frame["kind"], pattern: Pattern | undefined, ns: string[], binds: Map<string, any>): Frame {
    const root = new Scope();
    const fr: Frame = { scope: root, root, pattern, kind, ns, binds };
    binds.forEach((v, k) => { if (!(v instanceof TypeValue)) root.vars.set(k, { v, isConst: true }); });
    this.frames.push(fr);
    if (this.frames.length > MAX_DEPTH) this.error("evaluation depth exceeded");
    return fr;
  }

  private createStruct(c: CType & { t: "decl" }, d: A.StructDecl, placeBase?: number): Pattern {
    const p = this.newPattern(d.s === "union" ? "union" : "struct", c.display, 0, this.endian(c));
    p.parent = this.curFrame.pattern;
    const start = this.cursor;
    const fr = this.pushFrame("struct", p, d.ns, c.binds);
    fr.placeBase = placeBase;
    try {
      const run = (decl: A.StructDecl, binds: Map<string, any>) => {
        for (const inh of decl.inherits || []) {
          const pc = this.resolveType(inh);
          if (pc.t !== "decl" || (pc.decl.s !== "struct" && pc.decl.s !== "union")) this.error("can only inherit from structs", inh.loc);
          const save = fr.binds;
          fr.binds = pc.binds;
          pc.binds.forEach((v, k) => { if (!(v instanceof TypeValue)) fr.root.vars.set(k, { v, isConst: true }); });
          try { run(pc.decl as A.StructDecl, pc.binds); } finally { fr.binds = save; }
        }
        fr.binds = binds;
        try {
          this.execBlock(decl.body, fr, false);
        } catch (e) {
          if (!(e instanceof Signal)) throw e;
          // break / continue end the struct and propagate to the enclosing array
          this.pendingCtrl = e.kind;
        }
      };
      run(d, c.binds);
      if (p.kind === "union") {
        let max = 0;
        for (const m of p.children || []) if (!m.patternLocal && m.offset === start) max = Math.max(max, m.size);
        p.size = max;
      } else p.size = this.cursor - start;
      if (!p.children) p.children = [];
      // type attributes see the struct's members (`[[name(name), color(...)]]`)
      this.applyTypeAttrs(p, c);
    } finally { this.frames.pop(); }
    this.cursor = start + p.size;
    return p;
  }

  private createBitfield(c: CType & { t: "decl" }, d: A.BitfieldDecl): Pattern {
    const outer = this.curFrame;
    const nested = outer.kind === "bitfield" && outer.bit;
    const be = this.endian(c);
    const p = this.newPattern("bitfield", c.display, 0, be);
    p.parent = outer.pattern;
    let mode: BitMode;
    let startBit: number;
    if (nested) {
      mode = outer.bit!.mode;
      startBit = outer.bit!.pos;
    } else {
      mode = { be, root: this.cursor };
      startBit = 0;
      const ord = this.attrOf(d.attrs, "bitfield_order");
      if (ord) {
        const dir = this.toInt(this.evalExpr(ord.args[0]));
        const size = Number(this.toInt(this.evalExpr(ord.args[1])));
        mode.order = { lsbFirst: dir === 1n, size };
      } else if (this.attrOf(d.attrs, "left_to_right")) mode.order = { lsbFirst: false, size: 0 };
      else if (this.attrOf(d.attrs, "right_to_left")) mode.order = { lsbFirst: true, size: 0 };
    }
    p.bitMode = mode;
    p.bitPos = startBit;
    const fr = this.pushFrame("bitfield", p, d.ns, c.binds);
    fr.bit = { pos: startBit, mode };
    try {
      try { this.execBlock(d.body, fr, false); }
      catch (e) {
        if (!(e instanceof Signal)) throw e;
        this.pendingCtrl = e.kind;
      }
      const bits = fr.bit.pos - startBit;
      p.bits = bits;
      p.offset = mode.root + Math.floor(startBit / 8);
      if (nested) {
        outer.bit!.pos = fr.bit.pos;
        p.size = Math.ceil(((startBit % 8) + bits) / 8);
      } else {
        let total = bits;
        if (mode.order && mode.order.size) total = Math.max(total, mode.order.size);
        p.size = Math.ceil(total / 8);
        this.cursor = mode.root + p.size;
      }
      if (!p.children) p.children = [];
      this.applyTypeAttrs(p, c);
    } finally { this.frames.pop(); }
    if (!nested) this.cursor = mode.root + p.size;
    return p;
  }

  private attrOf(attrs: A.Attr[] | undefined, name: string): A.Attr | undefined {
    if (attrs) for (const a of attrs) if (a.name === name) return a;
    return undefined;
  }

  private applyTypeAttrs(p: Pattern, c: CType): void {
    if (c.t === "decl" && c.decl.attrs) this.applyAttrs(p, c.decl.attrs, true);
    if (c.attrs) this.applyAttrs(p, c.attrs, true);
  }

  /** Apply `[[attributes]]` to a created pattern. */
  applyAttrs(p: Pattern, attrs: A.Attr[], typeLevel = false): void {
    for (const a of attrs) {
      let args: any[];
      if (a.name === "fixed_size" || a.name === "transform" || a.name === "format" || a.name === "format_read") {
        args = a.args.map((e) => this.evalExpr(e));
      } else {
        // presentation-only attributes (colors, visualizers, ...) must not abort the evaluation
        args = a.args.map((e) => { try { return this.evalExpr(e); } catch (err) { if (err instanceof PatternError) return undefined; throw err; } });
      }
      if (!p.attrs) p.attrs = [];
      p.attrs.push({ name: a.name, args });
      switch (a.name) {
        case "hidden": p.hidden = true; break;
        case "sealed": p.sealed = true; break;
        case "format": case "format_read": p.formatFn = this.toStr(args[0]); break;
        case "transform": p.transformFn = this.toStr(args[0]); break;
        case "comment": p.comment = this.toStr(args[0]); break;
        case "color": p.color = this.toStr(args[0]); break;
        case "name": if (args[0] !== undefined) p.displayName = this.toStr(this.decay(args[0])); break;
        case "fixed_size": {
          const n = Number(this.toInt(args[0]));
          if (!typeLevel && p.size > n) this.error("pattern of size " + p.size + " exceeds fixed_size(" + n + ")");
          p.size = n;
          this.cursor = p.offset + n;
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ declarations
  private declare(name: string, v: Var, scope: Scope, loc: A.Loc): void {
    if (!name) return;
    if (scope.vars.has(name)) this.error("redefinition of variable '" + name + "'", loc);
    scope.vars.set(name, v);
  }

  private execDecl(d: A.DeclStmt, fr: Frame): void {
    this.loc = d.loc;
    if (d.bits !== undefined) { this.bitfieldField(d, fr); return; }
    const placed = d.placement !== undefined;
    const inStruct = fr.kind === "struct" || fr.kind === "bitfield";
    if (placed) { this.placedDecl(d, fr); return; }
    if (d.pointer && !inStruct) this.error("pointers cannot be used as local variables", d.loc);
    if (inStruct && d.init === undefined && !d.isIn && !d.isOut) { this.memberDecl(d, fr); return; }
    this.localDecl(d, fr, inStruct);
  }

  /** Data member of a struct/union/bitfield at the cursor. */
  private memberDecl(d: A.DeclStmt, fr: Frame): void {
    const parent = fr.pattern!;
    if (parent.kind === "union") this.cursor = parent.offset;
    const start = this.cursor;
    let p: Pattern;
    if (fr.kind === "bitfield") {
      // nested bitfields / arrays of them continue at the bit cursor
      p = this.createDecl(d);
    } else {
      p = this.createDecl(d);
    }
    if (this.attrOf(d.attrs, "no_unique_address")) this.cursor = start;
    this.addMember(fr, p, d);
  }

  private addMember(fr: Frame, p: Pattern, d: A.DeclStmt): void {
    const parent = fr.pattern!;
    p.parent = parent;
    // duplicates in the same scope are rejected by the parser; members declared in
    // different branches or loop iterations may share a name (the latest one wins)
    if (d.name) fr.root.vars.set(d.name, { v: p });
    parent.addChild(p);
  }

  /** Variable with an `@` placement. */
  private placedDecl(d: A.DeclStmt, fr: Frame): void {
    const off = this.toInt(this.evalExpr(d.placement!));
    let section = this.section;
    if (d.section !== undefined) section = this.userSection(this.toInt(this.evalExpr(d.section)));
    else if (section === HEAP_SECTION) section = MAIN_SECTION;
    let addr = Number(uintN(64, off));
    if (fr.placeBase !== undefined && d.section === undefined) addr += fr.placeBase;
    if (section === MAIN_SECTION && (addr < 0 || addr > this.mem(MAIN_SECTION).size()))
      this.error("cannot place variable '" + d.name + "' at out of bounds address 0x" + addr.toString(16), d.loc);
    if (d.type.name === "str" && !d.array) this.error("variables of type 'str' cannot be placed in memory", d.loc);
    const save = this.cursor;
    this.cursor = addr;
    this.sectionStack.push(section);
    let p: Pattern;
    try { p = this.createDecl(d); } finally { this.sectionStack.pop(); }
    if (fr.kind === "global") {
      // global placements move the cursor to the end of the placed variable
      this.declare(d.name, { v: p }, fr.scope, d.loc);
      this.patterns.push(p);
      if (d.name) this.variables.set(d.name, p);
    } else {
      this.cursor = save;
      if (fr.kind === "struct" || fr.kind === "bitfield") this.addMember(fr, p, d);
      else this.declare(d.name, { v: p }, fr.scope, d.loc);
    }
  }

  /** Local variable (heap), or pattern-local struct member when inStruct. */
  private localDecl(d: A.DeclStmt, fr: Frame, inStruct: boolean): void {
    let init: any = undefined;
    const hostIn = d.isIn && this.host.inVariables && d.name in this.host.inVariables;
    if (hostIn) init = this.host.inVariables![d.name];
    else if (d.init !== undefined) init = this.evalExpr(d.init);
    let p: Pattern | undefined;
    let v: any;
    if (d.type.name === "auto" && !d.array) {
      if (d.init === undefined) this.error("'auto' can only be used with parameters and initialized variables", d.loc);
      if (init instanceof Pattern) {
        p = this.heapClone(init, true);
        p.name = d.name;
      } else if (inStruct) {
        // inside a struct an `auto` local is still a (pattern-local) member
        p = this.literalPattern(init, d.name);
      } else v = init;
    } else {
      p = this.allocLocal(d);
      if (init !== undefined) this.assignPattern(p, init);
    }
    if (p && d.attrs) this.applyAttrs(p, d.attrs);
    const scope = inStruct ? fr.root : fr.scope;
    if (inStruct && p) {
      p.patternLocal = true;
      this.addMember(fr, p, d);
    } else {
      this.declare(d.name, p ? { v: p, isConst: d.isConst } : { v, isConst: d.isConst, binding: true }, scope, d.loc);
    }
  }

  /** A heap pattern holding a plain value (`auto x = 5;` inside a struct). */
  private literalPattern(v: any, name: string): Pattern {
    const kind: PKind = typeof v === "string" ? "string" : typeof v === "number" ? "float" : typeof v === "boolean" ? "bool"
      : v instanceof Chr ? "char" : typeof v === "bigint" && v < 0n ? "signed" : "unsigned";
    const size = kind === "string" ? v.length : kind === "float" ? 8 : kind === "bool" || kind === "char" ? 1 : 16;
    const typeName = kind === "string" ? "str" : kind === "float" ? "double" : kind === "bool" ? "bool" : kind === "char" ? "char" : kind === "signed" ? "s128" : "u128";
    const p = new Pattern(kind, typeName);
    p.section = HEAP_SECTION;
    p.offset = this.heap.alloc(size);
    p.size = size;
    p.local = true;
    p.loose = true;
    p.hasOverride = true;
    p.override = v;
    p.name = name;
    return p;
  }

  /** Instantiate a declaration's type in zeroed heap memory. */
  private allocLocal(d: A.DeclStmt): Pattern {
    const save = this.cursor;
    this.cursor = this.heap.top;
    this.sectionStack.push(HEAP_SECTION);
    try {
      const p = this.createDecl(d, true);
      this.heap.top = Math.max(this.heap.top, p.offset + Math.max(1, p.size));
      p.setLocal(true);
      return p;
    } finally {
      this.sectionStack.pop();
      this.cursor = save;
    }
  }

  /** Copy a pattern into fresh heap memory. */
  heapClone(src: Pattern, loose: boolean): Pattern {
    const addr = this.heap.alloc(src.size);
    const bytes = this.readPatternBytes(src);
    this.heap.write(addr, bytes);
    const p = src.clone(addr, HEAP_SECTION);
    // pattern trees that were never materialized in memory (bitfield fields) keep their mode
    p.setLocal(true, loose);
    this.copyOverrides(src, p);
    return p;
  }

  private copyOverrides(src: Pattern, dst: Pattern): void {
    if (src.hasOverride) { dst.hasOverride = true; dst.override = src.override; }
    if (src.children && dst.children) src.children.forEach((c, i) => dst.children![i] && this.copyOverrides(c, dst.children![i]));
  }

  readPatternBytes(p: Pattern): Uint8Array {
    if (p.kind === "string" && p.hasOverride) {
      const s = String(p.override);
      const b = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
      return b;
    }
    return this.mem(p.section).read(p.offset, p.size);
  }

  /** Create the pattern for a declaration: scalar, array or pointer. */
  private createDecl(d: A.DeclStmt, local = false): Pattern {
    const c = this.resolveType(d.type);
    let p: Pattern;
    if (d.pointer) p = this.createPointer(d, c);
    else if (d.array) p = this.createArray(c, d.array, d.name, local);
    else p = this.create(c, d.name);
    p.name = d.name;
    if (d.attrs) this.applyAttrs(p, d.attrs);
    return p;
  }

  private createPointer(d: A.DeclStmt, c: CType): Pattern {
    const sizeType = this.resolveType(d.pointer!);
    if (sizeType.t !== "builtin" || !(sizeType.name in INT_TYPES)) this.error("pointer size type must be an integer type", d.pointer!.loc);
    const ptr = this.newPattern("pointer", "", sizeType.size, this.endian(sizeType));
    ptr.fieldKind = sizeType.name[0] === "s" ? "signed" : "unsigned";
    this.cursor += sizeType.size;
    const end = this.cursor;
    let addr = this.toInt(this.readScalar(ptr, ptr.fieldKind === "signed" ? "signed" : "unsigned"));
    const pb = this.attrOf(d.attrs, "pointer_base");
    if (pb) {
      const fname = this.toStr(this.evalExpr(pb.args[0]));
      const fn = this.findFn(fname);
      if (!fn) this.error("pointer_base function '" + fname + "' not found", pb.args[0].loc);
      addr = this.toInt(this.callFn(fn, [addr], d.loc)) + addr;
    }
    const target = Number(uintN(64, addr));
    ptr.override = undefined;
    this.cursor = target;
    let pointee: Pattern;
    try {
      pointee = d.array ? this.createArray(c, d.array, "*" + d.name, false) : this.create(c, "*" + d.name);
    } finally { this.cursor = end; }
    ptr.typeName = this.typeDisplay(c) + "*";
    ptr.pointee = pointee;
    pointee.parent = ptr;
    return ptr;
  }

  private createArray(c: CType, spec: A.ArraySpec, name: string, local: boolean): Pattern {
    const start = this.cursor;
    const section = this.section;
    const isMain = section === MAIN_SECTION;
    const dataSize = this.mem(section).size();
    const elemName = c.t === "builtin" ? c.name : "";
    const staticElem = c.t === "builtin" || (c.t === "decl" && c.decl.s === "enum") || (c.t === "host");
    let proto: Pattern | undefined;
    if (staticElem) {
      proto = this.create(c, "");
      this.cursor = start;
    }
    const kindFor = (): PKind => (elemName === "char" ? "string" : elemName === "char16" ? "wstring" : elemName === "padding" ? "padding" : "array");
    const arr = this.newPattern(kindFor(), "", 0, proto ? proto.be : this.endian(c));
    arr.parent = this.curFrame.pattern;
    arr.children = undefined;
    const elemType = this.typeDisplay(c);
    let count = 0;
    const limitCheck = (n: number) => { if (!local && !staticElem && this.arrayLimit > 0 && n > this.arrayLimit) this.error("array grew past set limit of " + this.arrayLimit); };
    if (proto) {
      const es = proto.size;
      if (spec.k === "fixed") {
        const n = this.toInt(this.evalExpr(spec.size));
        if (n < 0n) this.error("array size cannot be negative");
        const total = n * BigInt(es);
        if ((isMain && BigInt(start) + total > BigInt(dataSize)) || BigInt(start) + total > 0xFFFFFFFFFFFFFFFFn)
          this.error("array expanded past end of the data");
        count = Number(n);
      } else if (spec.k === "while") {
        while (this.truthy(this.evalExpr(spec.cond))) {
          if (isMain && this.cursor + es > dataSize) this.error("array expanded past end of the data before termination condition was met");
          count++;
          this.cursor += es;
        }
      } else {
        for (;;) {
          if (isMain && this.cursor + es > dataSize) this.error("array expanded past end of the data before a null-entry was found");
          const b = this.mem(section).read(this.cursor, es);
          this.cursor += es;
          count++;
          if (b.every((x) => x === 0)) break;
        }
      }
      if (arr.kind === "array") {
        arr.proto = proto;
        arr.proto.parent = arr;
        arr.count = count;
      }
      arr.size = es * count;
      arr.count = count;
    } else {
      arr.children = [];
      let stop = false;
      let iteration = 0; // std::core::array_index() counts iterations, including dropped entries
      const addElem = () => {
        limitCheck(arr.children!.length + 1);
        const saveIdx = this.arrayIndex;
        this.arrayIndex = BigInt(iteration++);
        this.pendingCtrl = undefined;
        let e: Pattern;
        try { e = this.create(c, "[" + arr.children!.length + "]"); } finally { this.arrayIndex = saveIdx; }
        e.parent = arr;
        arr.children!.push(e);
        // `break` in an entry keeps it and ends the array, `continue` drops it
        const ctrl = this.pendingCtrl;
        this.pendingCtrl = undefined;
        this.lastCtrl = ctrl;
        if (ctrl === "break") stop = true;
        else if (ctrl === "return") { stop = true; this.pendingCtrl = "return"; }
        else if (ctrl === "continue") arr.children!.pop();
        return e;
      };
      if (spec.k === "fixed") {
        const n = Number(this.toInt(this.evalExpr(spec.size)));
        if (n < 0) this.error("array size cannot be negative");
        for (let i = 0; i < n && !stop; i++) {
          if (isMain && this.cursor > dataSize) this.error("array expanded past end of the data");
          addElem();
        }
      } else if (spec.k === "while") {
        while (!stop && this.truthy(this.evalExpr(spec.cond))) {
          if (isMain && this.cursor > dataSize) this.error("array expanded past end of the data before termination condition was met");
          addElem();
        }
      } else {
        // like the reference runtime: an unsized array of non-static entries ends after the
        // first entry unless the entry uses `continue` (then all-zero entries terminate it)
        while (!stop) {
          if (isMain && this.cursor >= dataSize) this.error("array expanded past end of the data before a null-entry was found");
          const n = arr.children.length;
          const e = addElem();
          if (stop) break;
          if (arr.children.length === n) continue; // `continue`: entry dropped, keep going
          if (!this.lastCtrl || this.readPatternBytes(e).every((x) => x === 0)) break;
        }
      }
      arr.count = arr.children.length;
      arr.size = this.cursor - start;
    }
    arr.typeName = elemType + "[" + arr.count + "]";
    this.cursor = start + arr.size;
    arr.name = name;
    return arr;
  }

  private bitfieldField(d: A.DeclStmt, fr: Frame): void {
    if (fr.kind !== "bitfield" || !fr.bit) this.error("bitfield fields can only be declared inside bitfields", d.loc);
    const width = Number(this.toInt(this.evalExpr(d.bits!)));
    if (width < 0 || width > 128) this.error("invalid bitfield field size " + width, d.loc);
    const bit = fr.bit!;
    if (!d.name) { bit.pos += width; return; } // padding
    const c = this.resolveType(d.type);
    const p = new Pattern("bitfield_field", "");
    p.section = this.section;
    p.local = this.section === HEAP_SECTION;
    p.bitMode = bit.mode;
    p.bitPos = bit.pos;
    p.bits = width;
    p.be = bit.mode.be;
    p.offset = bit.mode.root + Math.floor(bit.pos / 8);
    p.size = Math.ceil(((bit.pos % 8) + width) / 8);
    if (c.t === "builtin" && c.name === "bool") { p.fieldKind = "bool"; p.typeName = "bool"; }
    else if (c.t === "decl" && c.decl.s === "enum") { p.fieldKind = "enum"; p.enumInfo = this.enumInfo(c.decl); p.typeName = c.display; }
    else if (d.bitSign === "signed" || (c.t === "builtin" && c.name[0] === "s")) { p.fieldKind = "signed"; p.typeName = "signed"; }
    else { p.fieldKind = "unsigned"; p.typeName = d.bitSign === "unsigned" ? "unsigned" : ""; }
    p.name = d.name;
    // [[no_unique_address]] fields overlap the next field
    if (!this.attrOf(d.attrs, "no_unique_address")) bit.pos += width;
    if (d.attrs) this.applyAttrs(p, d.attrs);
    this.addMember(fr, p, d);
  }

  // ------------------------------------------------------------------ memory values
  private readBitsValue(p: Pattern): bigint {
    const m = p.bitMode!;
    const mem = this.mem(p.section);
    const w = p.bits;
    if (m.order && m.order.size) {
      const nbytes = Math.ceil(m.order.size / 8);
      const bytes = mem.read(m.root, nbytes);
      let v = 0n;
      if (m.be) for (let i = 0; i < nbytes; i++) v = (v << 8n) | BigInt(bytes[i]);
      else for (let i = nbytes - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
      const shift = m.order.lsbFirst ? p.bitPos : m.order.size - p.bitPos - w;
      return (v >> BigInt(shift)) & ((1n << BigInt(w)) - 1n);
    }
    const first = Math.floor(p.bitPos / 8);
    const nb = Math.ceil(((p.bitPos % 8) + w) / 8);
    const bytes = mem.read(m.root + first, nb);
    let v = 0n;
    const lsbFirst = m.order ? m.order.lsbFirst : !m.be;
    for (let i = 0; i < w; i++) {
      const k = (p.bitPos % 8) + i;
      const byte = bytes[k >> 3];
      const bitv = lsbFirst ? (byte >> (k & 7)) & 1 : (byte >> (7 - (k & 7))) & 1;
      if (lsbFirst) v |= BigInt(bitv) << BigInt(i);
      else v = (v << 1n) | BigInt(bitv);
    }
    return v;
  }

  private readInt(p: Pattern, signed: boolean): bigint {
    const b = this.mem(p.section).read(p.offset, p.size);
    let v = 0n;
    if (p.be) for (let i = 0; i < b.length; i++) v = (v << 8n) | BigInt(b[i]);
    else for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
    return signed ? intN(p.size * 8, v) : v;
  }

  private readScalar(p: Pattern, kind: string): any {
    switch (kind) {
      case "unsigned": return this.readInt(p, false);
      case "signed": return this.readInt(p, true);
      case "bool": return this.readInt(p, false) !== 0n;
      case "char": return new Chr(Number(this.readInt(p, false)));
      case "char16": return new Chr(Number(this.readInt(p, false)), true);
      case "float": {
        const b = this.mem(p.section).read(p.offset, p.size);
        const dv = new DataView(new ArrayBuffer(8));
        for (let i = 0; i < p.size; i++) dv.setUint8(i, p.be ? b[i] : b[p.size - 1 - i]);
        if (p.size === 4) return dv.getFloat32(0, false);
        if (p.size === 8) return dv.getFloat64(0, false);
        const h = dv.getUint16(0, false);
        const e = (h >> 10) & 0x1f, f = h & 0x3ff, s = h >> 15 ? -1 : 1;
        if (e === 0) return s * f * Math.pow(2, -24);
        if (e === 31) return f ? NaN : s * Infinity;
        return s * (1 + f / 1024) * Math.pow(2, e - 15);
      }
    }
    return undefined;
  }

  /** Argument passed to [[format]] / [[transform]] functions: raw value of scalars, the pattern otherwise. */
  private fnArg(p: Pattern): any {
    return p.isComposite() || p.kind === "pointer" ? p : this.value(p, true);
  }

  /** The value of a pattern (decays scalars; composites stay patterns). */
  value(p: Pattern, raw = false): any {
    if (!raw && p.transformFn) {
      const fn = this.findFn(p.transformFn);
      if (!fn) this.error("transform function '" + p.transformFn + "' not found");
      const r = this.callFn(fn, [this.fnArg(p)], this.loc);
      return r instanceof Pattern && !r.isComposite() ? this.value(r) : r;
    }
    if (p.hasOverride) return p.override;
    switch (p.kind) {
      case "unsigned": case "signed": case "bool": case "char": case "char16": case "float":
        return this.readScalar(p, p.kind);
      case "enum": return p.inner ? this.toInt(this.value(p.inner)) : this.readInt(p, p.fieldKind === "signed");
      case "padding": return p;
      case "struct":
        // a type imported from a file with a single variable decays to it
        if (p.imported && p.children && p.children.length === 1) return this.value(p.children[0]);
        return p;
      case "string": {
        const b = this.mem(p.section).read(p.offset, p.size);
        let s = "";
        for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return s;
      }
      case "wstring": {
        const b = this.mem(p.section).read(p.offset, p.size);
        let s = "";
        for (let i = 0; i + 1 < b.length; i += 2) {
          const c = p.be ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8);
          s += String.fromCharCode(c);
        }
        return s;
      }
      case "bitfield_field": {
        const v = this.readBitsValue(p);
        if (p.fieldKind === "bool") return v !== 0n;
        if (p.fieldKind === "signed") return intN(p.bits, v);
        return v;
      }
      case "pointer": return this.readInt(p, p.fieldKind === "signed");
    }
    return p;
  }

  private encodeInt(v: bigint, size: number, be: boolean): Uint8Array {
    const b = new Uint8Array(size);
    let x = uintN(size * 8, v);
    for (let i = 0; i < size; i++) { b[be ? size - 1 - i : i] = Number(x & 0xffn); x >>= 8n; }
    return b;
  }

  /** Write a value into a pattern (local variables, members, array entries). */
  assignPattern(p: Pattern, v: any): void {
    if (v === null || v === undefined) return;
    if (v instanceof Array) {
      if (p.kind !== "array" && p.kind !== "string") this.error("cannot assign a list to a non-array variable");
      if (p.kind === "string") { this.assignPattern(p, v.map((x) => this.toStr(x)).join("")); return; }
      v.forEach((x, i) => { const e = p.entry(i); if (e) this.assignPattern(e, x); });
      return;
    }
    if (v instanceof Pattern && v.isComposite()) {
      if (!p.isComposite()) { this.assignPattern(p, this.value(v)); return; }
      if (p.kind === "array" || v.kind === "array") {
        const n = Math.min(p.entryCount(), v.entryCount());
        for (let i = 0; i < n; i++) this.assignPattern(p.entry(i)!, v.entry(i)!);
        return;
      }
      const pc = p.children || [], vc = v.children || [];
      for (let i = 0; i < pc.length && i < vc.length; i++) this.assignPattern(pc[i], vc[i]);
      return;
    }
    if (v instanceof Pattern) v = this.value(v);
    if (p.isComposite()) {
      if (v instanceof Pattern) return;
      this.error("cannot assign a " + this.typeOfValue(v) + " to a " + p.typeName);
    }
    const writable = p.section !== MAIN_SECTION && !p.loose && (this.mem(p.section) as any).write;
    if (p.kind === "string" || p.kind === "wstring") {
      if (writable && !p.hasOverride) {
        const s = this.toStr(v);
        const b = new Uint8Array(p.size);
        for (let i = 0; i < s.length && i < p.size; i++) b[i] = s.charCodeAt(i) & 0xff;
        this.mem(p.section).write!(p.offset, b);
      } else { p.hasOverride = true; p.override = this.toStr(v); }
      return;
    }
    const conv = this.convertFor(p, v);
    if (p.loose) { p.hasOverride = true; p.override = v instanceof Chr || typeof v !== "bigint" ? v : v; return; }
    if (!writable || p.kind === "bitfield_field") { p.hasOverride = true; p.override = conv; return; }
    p.hasOverride = false;
    let bytes: Uint8Array;
    switch (p.kind) {
      case "float": {
        const dv = new DataView(new ArrayBuffer(8));
        if (p.size === 4) dv.setFloat32(0, Number(conv), false); else dv.setFloat64(0, Number(conv), false);
        bytes = new Uint8Array(p.size);
        for (let i = 0; i < p.size; i++) bytes[p.be ? i : p.size - 1 - i] = dv.getUint8(i);
        break;
      }
      case "bool": bytes = this.encodeInt(conv ? 1n : 0n, p.size, p.be); break;
      case "char": case "char16": bytes = this.encodeInt(BigInt((conv as Chr).c), p.size, p.be); break;
      case "padding": return;
      default: bytes = this.encodeInt(this.toInt(conv), p.size, p.be);
    }
    this.mem(p.section).write!(p.offset, bytes);
  }

  /** Convert a value to the representation of a scalar pattern kind. */
  private convertFor(p: Pattern, v: any): any {
    switch (p.kind) {
      case "unsigned": case "enum": case "pointer": return p.fieldKind === "signed" ? intN(p.size * 8, this.toInt(v)) : uintN(p.size * 8, this.toInt(v));
      case "signed": return intN(p.size * 8, this.toInt(v));
      case "float": return p.size === 4 ? Math.fround(this.toFloat(v)) : this.toFloat(v);
      case "bool": return this.truthy(v);
      case "char": return new Chr(Number(uintN(8, this.toInt(v))));
      case "char16": return new Chr(Number(uintN(16, this.toInt(v))), true);
      case "bitfield_field":
        if (p.fieldKind === "bool") return this.truthy(v);
        return p.fieldKind === "signed" ? intN(p.bits, this.toInt(v)) : uintN(p.bits, this.toInt(v));
    }
    return v;
  }

  // ------------------------------------------------------------------ statements
  execBlock(body: A.Stmt[], fr: Frame, newScope = true): void {
    const save = fr.scope;
    if (newScope && fr.kind !== "global") fr.scope = new Scope(save);
    try {
      for (const s of body) {
        this.exec(s, fr);
        if (this.pendingCtrl) {
          const k = this.pendingCtrl;
          this.pendingCtrl = undefined;
          if (fr.kind === "struct" || fr.kind === "bitfield") throw new Signal(k);
          if (fr.kind === "global" && k === "return") throw new Signal("return");
        }
      }
    } finally { fr.scope = save; }
  }

  private nested(body: A.Stmt[], fr: Frame): void {
    // struct members declared in nested blocks still belong to the struct
    this.execBlock(body, fr, true);
  }

  exec(s: A.Stmt, fr: Frame): void {
    this.loc = s.loc;
    switch (s.s) {
      case "decl": this.execDecl(s, fr); return;
      case "multi": for (const d of s.decls) this.execDecl(d, fr); return;
      case "assign": this.execAssign(s.target, s.op, s.value); return;
      case "expr": this.evalExpr(s.e); return;
      case "if":
        if (this.truthy(this.evalExpr(s.cond))) this.nested(s.then, fr);
        else if (s.else) this.nested(s.else, fr);
        return;
      case "while": {
        let n = 0;
        while (this.truthy(this.evalExpr(s.cond))) {
          if (++n > 0x1000000) this.error("while loop exceeded iteration limit", s.loc);
          try { this.nested(s.body, fr); }
          catch (e) {
            if (e instanceof Signal && e.kind === "break") break;
            if (e instanceof Signal && e.kind === "continue") continue;
            throw e;
          }
        }
        return;
      }
      case "for": {
        const save = fr.scope;
        if (fr.kind !== "global") fr.scope = new Scope(save);
        else fr.scope = new Scope(save);
        try {
          if (s.init) this.exec(s.init, fr);
          let n = 0;
          while (this.truthy(this.evalExpr(s.cond))) {
            if (++n > 0x1000000) this.error("for loop exceeded iteration limit", s.loc);
            try { this.nested(s.body, fr); }
            catch (e) {
              if (e instanceof Signal && e.kind === "break") break;
              if (!(e instanceof Signal && e.kind === "continue")) throw e;
            }
            if (s.step) this.exec(s.step, fr);
          }
        } finally { fr.scope = save; }
        return;
      }
      case "match": this.execMatch(s, fr); return;
      case "try": {
        const cursor = this.cursor;
        const nchildren = fr.pattern && fr.pattern.children ? fr.pattern.children.length : 0;
        try { this.nested(s.body, fr); }
        catch (e) {
          if (!(e instanceof PatternError)) throw e;
          this.cursor = cursor;
          if (fr.pattern && fr.pattern.children) {
            for (const c of fr.pattern.children.splice(nchildren)) if (c.name) fr.root.vars.delete(c.name);
          }
          this.nested(s.handler, fr);
        }
        return;
      }
      case "return": throw new Signal("return", s.value ? this.evalExpr(s.value) : undefined);
      case "break": throw new Signal("break");
      case "continue": throw new Signal("continue");
      case "block": this.nested(s.body, fr); return;
      case "nsctx": {
        const save = fr.ns;
        fr.ns = s.ns;
        try { for (const x of s.body) this.exec(x, fr); } finally { fr.ns = save; }
        return;
      }
      case "fn":
        if (fr.kind !== "global") this.fns.set(s.name, s);
        return;
      case "struct": case "union": case "enum": case "bitfield": case "using": case "imported":
        if (fr.kind !== "global") this.types.set(s.name, s);
        return;
      case "import": return;
    }
  }

  private execMatch(s: A.Stmt & { s: "match" }, fr: Frame): void {
    const subj = s.subjects.map((e) => this.decay(this.evalExpr(e)));
    let chosen: A.MatchCase | undefined;
    let def: A.MatchCase | undefined;
    for (const c of s.cases) {
      if (!c.pats) { if (!def) def = c; continue; }
      if (c.pats.length !== subj.length) this.error("match case has " + c.pats.length + " patterns but " + subj.length + " values", c.loc);
      let ok = true;
      for (let i = 0; i < subj.length && ok; i++) {
        const pat = c.pats[i];
        if (pat.any) continue;
        ok = pat.alts.some((alt) => {
          const lo = this.decay(this.evalExpr(alt.lo));
          if (alt.hi === undefined) return this.equals(subj[i], lo);
          const hi = this.decay(this.evalExpr(alt.hi));
          return this.compare(subj[i], lo) >= 0 && this.compare(subj[i], hi) <= 0;
        });
      }
      if (ok) {
        if (chosen) this.error("match statement is ambiguous: more than one case matches", c.loc);
        chosen = c;
      }
    }
    const body = chosen || def;
    if (body) this.nested(body.body, fr);
  }

  private execAssign(target: A.Expr, op: string, valueExpr: A.Expr): void {
    let v = this.evalExpr(valueExpr);
    if (target.k === "dollar") {
      if (op !== "=") v = this.binop(op.slice(0, -1), this.dollar(), this.decay(v), target.loc);
      this.setDollar(this.toInt(this.decay(v)));
      return;
    }
    if (target.k === "id") {
      const vr = this.findVar(target.name);
      if (!vr) this.error("variable '" + target.name + "' does not exist", target.loc);
      if (vr.isConst) this.error("cannot assign to constant variable '" + target.name + "'", target.loc);
      if (op !== "=") v = this.binop(op.slice(0, -1), this.decay(vr.v), this.decay(v), target.loc);
      if (vr.v instanceof Pattern && !vr.binding) this.assignPattern(vr.v, v);
      else vr.v = v instanceof Pattern && !v.isComposite() ? this.value(v) : v;
      return;
    }
    const p = this.evalExpr(target);
    if (!(p instanceof Pattern)) this.error("cannot assign to a non-variable expression", target.loc);
    if (op !== "=") v = this.binop(op.slice(0, -1), this.decay(p), this.decay(v), target.loc);
    this.assignPattern(p, v);
  }

  /** `$` as an exact u64 (the numeric cursor loses precision above 2^53). */
  private cursorBig?: bigint;
  dollar(): bigint {
    return this.cursorBig !== undefined && Number(this.cursorBig) === this.cursor ? this.cursorBig : BigInt(this.cursor);
  }
  setDollar(v: bigint): void {
    const u = uintN(64, v);
    this.cursor = Number(u);
    this.cursorBig = u > 9007199254740991n ? u : undefined;
  }

  // ------------------------------------------------------------------ functions
  callFn(fn: A.FnDecl, args: any[], loc: A.Loc): any {
    const required = fn.params.filter((p) => !p.def && !p.pack).length;
    const hasPack = fn.params.some((p) => p.pack);
    if (args.length < required) this.error("too few arguments for function '" + fn.name + "': expected " + required + ", got " + args.length, loc);
    if (!hasPack && args.length > fn.params.length) this.error("too many arguments for function '" + fn.name + "'", loc);
    const caller = this.curFrame;
    const fr = this.pushFrame("fn", undefined, fn.ns, new Map());
    const saveCursor = this.cursor;
    if (++this.depth > this.evalDepth) { this.depth--; this.frames.pop(); this.error("evaluation depth exceeded", loc); }
    try {
      fn.params.forEach((p, i) => {
        let v: any;
        if (p.pack) v = new Pack(args.slice(i));
        else if (i < args.length) v = args[i];
        else {
          // defaults are evaluated in the function scope
          v = this.evalExpr(p.def!);
        }
        if (!p.pack && !p.ref) {
          if (v instanceof Pattern && !v.isComposite()) v = this.value(v);
          if (p.type && p.type.name !== "auto" && isBuiltinType(p.type.name) && !(v instanceof Pattern)) v = this.cast(p.type.name, v, loc);
        }
        if (p.name) fr.root.vars.set(p.name, { v, binding: !p.ref || !(v instanceof Pattern) });
      });
      void caller;
      this.execBlock(fn.body, fr, false);
      return undefined;
    } catch (e) {
      if (e instanceof Signal) {
        if (e.kind === "return") return e.value;
        this.error(e.kind + " statement outside of a loop", loc);
      }
      throw e;
    } finally {
      this.depth--;
      this.frames.pop();
      this.cursor = saveCursor;
    }
  }

  // ------------------------------------------------------------------ expressions
  findVar(name: string): Var | undefined {
    const fr = this.curFrame;
    return fr.scope.find(name) || (fr !== this.global ? this.global.scope.find(name) || this.global.root.vars.get(name) : undefined);
  }

  /** Decay patterns to plain values (composites stay patterns). */
  decay(v: any): any {
    return v instanceof Pattern ? this.value(v) : v;
  }

  private thisPattern(): Pattern | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      if (f.pattern) return f.pattern;
      if (f.kind === "fn" || f.kind === "alias") continue;
    }
    return undefined;
  }

  evalExpr(e: A.Expr): any {
    switch (e.k) {
      case "lit": return e.v;
      case "id": {
        const vr = this.findVar(e.name);
        if (vr) return vr.v;
        const ec = this.enumConstant(e.name);
        if (ec !== undefined) return ec;
        const t = this.findType(e.name);
        if (t && t.s !== "fn") return new TypeValue(this.resolveType({ name: e.name, loc: e.loc }));
        if (isBuiltinType(e.name)) return new TypeValue(this.resolveType({ name: e.name, loc: e.loc }));
        return this.error("variable '" + e.name + "' does not exist", e.loc);
      }
      case "dollar": return this.dollar();
      case "this": {
        const p = this.thisPattern();
        if (!p) this.error("'this' used outside of a struct", e.loc);
        return p;
      }
      case "parent": {
        const k = this.frames.length - 1;
        let idx = k;
        // skip the frame of the current struct itself
        if (this.frames[k].kind === "fn") idx = k; else idx = k;
        const pf = this.frames[idx - 1];
        const p = pf && pf.pattern;
        if (!p) this.error("no parent available", e.loc);
        return p;
      }
      case "member": {
        let o = this.evalExpr(e.obj);
        if (o instanceof Pattern && o.kind === "pointer") o = o.pointee;
        if (!(o instanceof Pattern)) this.error("cannot access member '" + e.name + "' of a non-struct value", e.loc);
        let m = o.member(e.name);
        if (!m && e.name === "parent") {
          m = o.parent;
          while (m && (m.kind === "array" || m.kind === "pointer")) m = m.parent;
          if (!m) this.error("pattern has no parent", e.loc);
          return m;
        }
        if (!m) this.error("no member named '" + e.name + "' in " + o.typeName, e.loc);
        return m.kind === "pointer" ? m.pointee : m;
      }
      case "index": {
        if (e.obj.k === "dollar") {
          const a = Number(uintN(64, this.toInt(this.decay(this.evalExpr(e.idx)))));
          const b = this.mem(this.section).read(a, 1);
          return BigInt(b[0]);
        }
        let o = this.evalExpr(e.obj);
        const i = Number(this.toInt(this.decay(this.evalExpr(e.idx))));
        if (o instanceof Pattern && o.kind === "pointer") o = o.pointee;
        if (o instanceof Pattern) {
          if (o.kind === "string" || o.kind === "wstring") {
            const s = this.value(o) as string;
            if (i < 0 || i >= (o.hasOverride ? s.length : o.size / (o.kind === "wstring" ? 2 : 1))) this.error("index " + i + " out of bounds", e.loc);
            return new Chr(s.charCodeAt(i) || 0, o.kind === "wstring");
          }
          if (o.kind !== "array") this.error("cannot index a non-array pattern", e.loc);
          const en = o.entry(i);
          if (!en) this.error("array index " + i + " out of bounds (size " + o.entryCount() + ")", e.loc);
          return en.kind === "pointer" ? en.pointee : en;
        }
        if (typeof o === "string") {
          if (i < 0 || i >= o.length) this.error("string index " + i + " out of bounds", e.loc);
          return new Chr(o.charCodeAt(i));
        }
        if (o instanceof Pack) {
          if (i < 0 || i >= o.items.length) this.error("pack index out of bounds", e.loc);
          return o.items[i];
        }
        return this.error("cannot index this value", e.loc);
      }
      case "call": return this.evalCall(e);
      case "bin": {
        if (e.op === "&&") return this.truthy(this.decay(this.evalExpr(e.l))) && this.truthy(this.decay(this.evalExpr(e.r)));
        if (e.op === "||") return this.truthy(this.decay(this.evalExpr(e.l))) || this.truthy(this.decay(this.evalExpr(e.r)));
        return this.binop(e.op, this.decay(this.evalExpr(e.l)), this.decay(this.evalExpr(e.r)), e.loc);
      }
      case "un": {
        const v = this.decay(this.evalExpr(e.e));
        if (e.op === "!") return !this.truthy(v);
        if (typeof v === "number") { if (e.op === "-") return -v; this.error("invalid operand for '~'", e.loc); }
        if (typeof v === "string") this.error("invalid string operand for unary '" + e.op + "'", e.loc);
        const n = this.toInt(v);
        return e.op === "-" ? -n : ~n;
      }
      case "tern": return this.truthy(this.decay(this.evalExpr(e.c))) ? this.evalExpr(e.a) : this.evalExpr(e.b);
      case "typeop": return this.evalTypeOp(e);
      case "list": return e.items.map((x) => this.decay(this.evalExpr(x)));
      case "type": return new TypeValue(this.resolveType(e.t));
    }
    return undefined;
  }

  private evalTypeOp(e: A.Expr & { k: "typeop" }): any {
    let target: any;
    if (e.t) target = new TypeValue(this.resolveType(e.t));
    else if (e.e!.k === "dollar") {
      if (e.op === "sizeof") return BigInt(this.mem(this.section).size());
      if (e.op === "addressof") return 0n;
      target = this.dollar();
    } else target = this.evalExpr(e.e!);
    switch (e.op) {
      case "sizeof":
        if (target instanceof TypeValue) return BigInt(this.sizeOfType(target.t));
        if (target instanceof Pattern) return BigInt(target.kind === "pointer" && target.pointee ? target.pointee.size : target.size);
        if (typeof target === "string") return BigInt(target.length);
        return this.error("sizeof on a non-pattern value", e.loc);
      case "addressof":
        if (target instanceof Pattern) return BigInt(target.offset);
        return this.error("addressof on a non-pattern value", e.loc);
      case "typenameof":
        if (target instanceof TypeValue) return this.typeDisplay(target.t);
        if (target instanceof Pattern) return target.typeName;
        return this.error("typenameof on a non-pattern value", e.loc);
    }
  }

  private evalCall(e: A.Expr & { k: "call" }): any {
    // casts: `u8(x)`, `Identity<u32>(x)`
    const tdecl = isBuiltinType(e.name) ? undefined : this.findType(e.name);
    if (isBuiltinType(e.name) || (tdecl && tdecl.s !== "fn")) {
      if (e.args.length !== 1) this.error("cast expects exactly one argument", e.loc);
      const c = this.resolveType({ name: e.name, args: e.targs, loc: e.loc });
      const v = this.decay(this.evalExpr(e.args[0]));
      if (c.t === "builtin") {
        const r = this.cast(c.name, v, e.loc);
        // `be u16(x)`: the value as it reads when stored with that endianness (byte swap vs. little endian)
        if (e.endian === "be" && typeof r === "bigint" && c.size > 1) {
          let x = uintN(c.size * 8, r), y = 0n;
          for (let i = 0; i < c.size; i++) { y = (y << 8n) | (x & 0xffn); x >>= 8n; }
          return c.name[0] === "s" ? intN(c.size * 8, y) : y;
        }
        return r;
      }
      if (c.t === "decl" && c.decl.s === "enum") {
        const ut = this.resolveInFrame(c.decl.underlying, c.decl.ns);
        return this.cast((ut as any).name, v, e.loc);
      }
      return v;
    }
    const args: any[] = [];
    for (const a of e.args) {
      let v = this.evalExpr(a);
      // arguments are rvalues: patterns with a [[transform]] pass their transformed value
      if (v instanceof Pattern && v.transformFn) v = this.value(v);
      if (v instanceof Pack) args.push(...v.items); else args.push(v);
    }
    const fn = this.findFn(e.name);
    if (fn) return this.callFn(fn, args, e.loc);
    const name = e.name.startsWith("builtin::") ? e.name.substr(9) : e.name;
    if (this.host.functions && this.host.functions[name]) return this.host.functions[name](args, this);
    const r = callBuiltin(this, name, args, e.loc);
    if (r !== NOT_FOUND) return r;
    return this.error("function '" + e.name + "' does not exist", e.loc);
  }

  cast(type: string, v: any, loc: A.Loc): any {
    if (type[0] === "i") type = "s" + type.substr(1);
    if (type in INT_TYPES) {
      if (typeof v === "string") this.error("cannot cast a string to " + type, loc);
      const bits = INT_TYPES[type] * 8;
      const n = this.toInt(v);
      return type[0] === "s" ? intN(bits, n) : uintN(bits, n);
    }
    switch (type) {
      case "float": return Math.fround(this.toFloat(v));
      case "double": case "float16": return this.toFloat(v);
      case "bool": return this.truthy(v);
      case "char": return new Chr(Number(uintN(8, this.toInt(v))));
      case "char16": return new Chr(Number(uintN(16, this.toInt(v))), true);
      case "str": return this.toStr(v);
    }
    return v;
  }

  // ------------------------------------------------------------------ value helpers
  truthy(v: any): boolean {
    if (v === null || v === undefined) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "bigint") return v !== 0n;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v.length > 0;
    if (v instanceof Chr) return v.c !== 0;
    if (v instanceof Pattern) return this.truthy(this.value(v)) || v.isComposite();
    return true;
  }

  toInt(v: any): bigint {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") { if (!isFinite(v)) return 0n; return BigInt(Math.trunc(v)); }
    if (typeof v === "boolean") return v ? 1n : 0n;
    if (v instanceof Chr) return BigInt(v.c);
    if (v === null || v === undefined) return 0n;
    if (v instanceof Pattern) {
      const x = this.value(v);
      if (x instanceof Pattern) this.error("cannot use pattern '" + v.typeName + "' as an integer");
      return this.toInt(x);
    }
    return this.error("cannot convert " + this.typeOfValue(v) + " to an integer");
  }

  toFloat(v: any): number {
    if (typeof v === "number") return v;
    return Number(this.toInt(v));
  }

  typeOfValue(v: any): string {
    if (typeof v === "string") return "string";
    if (typeof v === "number") return "float";
    if (typeof v === "bigint") return "integer";
    if (typeof v === "boolean") return "bool";
    if (v instanceof Chr) return "char";
    if (v instanceof Pattern) return v.typeName;
    return "void";
  }

  toStr(v: any): string {
    if (typeof v === "string") return v;
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "number") return fmtFloat(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    if (v instanceof Chr) return String.fromCharCode(v.c);
    if (v === null || v === undefined) return "null";
    if (v instanceof Pattern) return this.formatPattern(v, true);
    if (v instanceof TypeValue) return this.typeDisplay(v.t);
    return String(v);
  }

  equals(a: any, b: any): boolean { return this.compare(a, b) === 0; }

  /** Three-way compare; NaN-like mismatch returns 2. */
  compare(a: any, b: any): number {
    if (typeof a === "string" || typeof b === "string") {
      const x = this.toStr(a), y = this.toStr(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    if (a instanceof Pattern || b instanceof Pattern) return a === b ? 0 : 2;
    if (typeof a === "number" || typeof b === "number") {
      const x = this.toFloat(a), y = this.toFloat(b);
      return x < y ? -1 : x > y ? 1 : x === y ? 0 : 2;
    }
    const x = this.toInt(a), y = this.toInt(b);
    if ((x & MASK128) === (y & MASK128)) return 0;
    return x < y ? -1 : 1;
  }

  binop(op: string, l: any, r: any, loc: A.Loc): any {
    const isStr = typeof l === "string" || typeof r === "string";
    if (isStr) {
      switch (op) {
        case "+":
          if ((typeof l === "string" || l instanceof Chr) && (typeof r === "string" || r instanceof Chr)) return this.toStr(l) + this.toStr(r);
          break;
        case "*": {
          if (typeof l === "string" && typeof r !== "string") {
            const n = this.toInt(r);
            if (n < 0n) this.error("cannot repeat a string a negative number of times", loc);
            return l.repeat(Number(n));
          }
          break;
        }
        case "==": return this.compare(l, r) === 0;
        case "!=": return this.compare(l, r) !== 0;
        case "<": return this.compare(l, r) < 0;
        case ">": return this.compare(l, r) === 1;
        case "<=": return this.compare(l, r) <= 0;
        case ">=": return this.compare(l, r) === 0 || this.compare(l, r) === 1;
      }
      this.error("invalid operand types for '" + op + "': " + this.typeOfValue(l) + " and " + this.typeOfValue(r), loc);
    }
    switch (op) {
      case "==": return this.compare(l, r) === 0;
      case "!=": return this.compare(l, r) !== 0;
      case "<": return this.compare(l, r) === -1;
      case ">": return this.compare(l, r) === 1;
      case "<=": { const c = this.compare(l, r); return c === -1 || c === 0; }
      case ">=": { const c = this.compare(l, r); return c === 1 || c === 0; }
      case "^^": return this.truthy(l) !== this.truthy(r);
      case "&&": return this.truthy(l) && this.truthy(r);
      case "||": return this.truthy(l) || this.truthy(r);
    }
    if (l instanceof Pattern || r instanceof Pattern) this.error("invalid operand types for '" + op + "': " + this.typeOfValue(l) + " and " + this.typeOfValue(r), loc);
    if (typeof l === "number" || typeof r === "number") {
      const x = this.toFloat(l), y = this.toFloat(r);
      switch (op) {
        case "+": return x + y;
        case "-": return x - y;
        case "*": return x * y;
        case "/": if (y === 0) this.error("division by zero", loc); return x / y;
        case "%": if (y === 0) this.error("modulo by zero", loc); return x % y;
      }
      this.error("invalid floating point operator '" + op + "'", loc);
    }
    const x = this.toInt(l), y = this.toInt(r);
    switch (op) {
      case "+": return x + y;
      case "-": return x - y;
      case "*": return x * y;
      case "/": if (y === 0n) this.error("division by zero", loc); return x / y;
      case "%": if (y === 0n) this.error("modulo by zero", loc); return x % y;
      case "&": return x & y;
      case "|": return x | y;
      case "^": return x ^ y;
      case "<<": return y > 256n ? 0n : (x << y) & MASK128;
      case ">>": return x >> y;
    }
    return this.error("unknown operator '" + op + "'", loc);
  }

  // ------------------------------------------------------------------ formatting
  /** Display string of a pattern's value (used by dump and std::format). */
  formatPattern(p: Pattern, inline = false): string {
    if (p.formatFn) {
      const fn = this.findFn(p.formatFn);
      if (fn) return this.toStr(this.decay(this.callFn(fn, [this.fnArg(p)], this.loc)));
    }
    if (p.kind === "enum" || (p.kind === "bitfield_field" && p.fieldKind === "enum")) {
      const v = p.kind === "enum" ? this.value(p, true) : this.readBitsValue(p);
      const info = p.enumInfo!;
      for (const en of info.entries) if (v >= en.lo && v <= en.hi) return info.name + "::" + en.name;
      return info.name + "::???";
    }
    if (p.isComposite()) {
      if (p.kind === "array") {
        const n = p.entryCount();
        const items: string[] = [];
        for (let i = 0; i < n && i < 16; i++) items.push(this.formatPattern(p.entry(i)!, true));
        return "[ " + items.join(", ") + (n > 16 ? ", ..." : "") + " ]";
      }
      const mem = (p.children || []).map((c) => c.name + " = " + this.formatPattern(c, true));
      return p.typeName + "{ " + mem.join(", ") + (mem.length ? " " : "") + "}";
    }
    const v = this.value(p);
    if (typeof v === "string" && inline) return JSON.stringify(v);
    return this.toStr(v);
  }

  format(fmt: string, args: any[]): string {
    return formatString(this, fmt, args);
  }

  print(s: string): void {
    this.output.push(s);
    this.printFn(s);
  }

  // ------------------------------------------------------------------ dump
  /** Print the pattern tree; `base` is added to displayed addresses. */
  dump(print: (s: string) => void = (s) => console.log(s), base = 0): void {
    this.dumpBase = base;
    for (const p of this.patterns) this.dumpPattern(p, 0, print, p.name);
  }
  private dumpBase = 0;

  private dumpPattern(p: Pattern, indent: number, print: (s: string) => void, name: string): void {
    if (p.hidden) return;
    if (p.displayName) name = p.displayName;
    const pad = "".padStart(indent * 2, " ");
    const addr = p.local ? "local" : "0x" + (this.dumpBase + p.offset).toString(16).padStart(8, "0");
    const type = p.kind === "bitfield_field" ? p.typeName + ":" + p.bits : p.typeName;
    let line = pad + name + " (" + type + ") @ " + addr;
    if (p.kind === "pointer") {
      const v = this.value(p) as bigint;
      print(line + " = " + fmtInt(v));
      if (p.pointee) this.dumpPattern(p.pointee, indent + 1, print, p.pointee.name || "*" + name);
      return;
    }
    if (p.isComposite() && !p.formatFn && !p.transformFn) {
      print(line + " size=" + p.size);
      if (p.sealed) return;
      if (p.kind === "array") {
        const n = p.entryCount();
        for (let i = 0; i < n; i++) this.dumpPattern(p.entry(i)!, indent + 1, print, name + "[" + i + "]");
      } else for (const c of p.children || []) this.dumpPattern(c, indent + 1, print, c.name);
      return;
    }
    if (p.kind === "padding") { print(line + " size=" + p.size); return; }
    line += " = " + this.dumpValue(p);
    print(line);
  }

  private dumpValue(p: Pattern): string {
    if (p.formatFn) return this.formatPattern(p);
    if (p.transformFn) return this.formatValue(this.value(p));
    if (p.kind === "enum" || (p.kind === "bitfield_field" && p.fieldKind === "enum")) {
      const v = p.kind === "enum" ? this.value(p, true) : this.readBitsValue(p);
      return fmtInt(v) + " = " + this.formatPattern(p);
    }
    const v = this.value(p);
    // strings keep all their bytes; the terminating/padding NULs are not shown
    if ((p.kind === "string" || p.kind === "wstring") && typeof v === "string") return quote(v.replace(/\0+$/, ""));
    return this.formatValue(v);
  }

  /** Evaluate an expression in the global scope of this (already evaluated) instance. */
  evaluateExpression(src: string): any {
    const e = parseExpression(src, this.types.keys());
    if (!this.global) {
      const root = new Scope();
      this.global = { scope: root, root, kind: "global", ns: [], binds: new Map() };
    }
    this.frames = [this.global];
    return this.evalExpr(e);
  }

  /** Human readable rendering of any runtime value (dump style). */
  describe(v: any, base = 0): string {
    if (v instanceof Pattern) {
      const lines: string[] = [];
      this.dumpBase = base;
      this.dumpPattern(v, 0, (s) => lines.push(s), v.name || "<value>");
      return lines.join("\n");
    }
    if (v instanceof TypeValue) return this.typeDisplay(v.t);
    if (v instanceof Pack) return v.items.map((x) => this.describe(x)).join(", ");
    if (v instanceof Array) return "{ " + v.map((x) => this.describe(x)).join(", ") + " }";
    if (v instanceof Chr) return quote(String.fromCharCode(v.c)).replace(/^"|"$/g, "'");
    if (v === undefined) return "";
    return this.formatValue(v);
  }

  /** Names of the types known to this instance (for listing and completion). */
  typeNames(): string[] { return Array.from(this.types.keys()).filter((n) => this.types.get(n)!.s !== "fn"); }
  functionNames(): string[] { return Array.from(this.fns.keys()); }

  private formatValue(v: any): string {
    if (typeof v === "bigint") return fmtInt(v);
    if (typeof v === "number") return fmtFloat(v);
    if (typeof v === "string") return quote(v);
    if (v instanceof Chr) return fmtInt(BigInt(v.c));
    if (v instanceof Pattern) return this.formatPattern(v);
    return String(v);
  }

  get(name: string): Pattern | undefined { return this.variables.get(name); }
}

export const NOT_FOUND = Symbol("not found");

export function fmtInt(v: bigint): string {
  return v + " (" + (v < 0n ? "-0x" + (-v).toString(16) : "0x" + v.toString(16)) + ")";
}

export function fmtFloat(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 1e21) return v.toFixed(1).replace(/\.0$/, "") === String(v) ? String(v) : String(v);
  return String(v);
}

export function quote(s: string): string {
  return '"' + s.replace(/[\x00-\x1f\x7f-\xff\\"]/g, (c) => {
    const esc: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t", "\\": "\\\\", '"': '\\"' };
    return esc[c] || "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0");
  }) + '"';
}
