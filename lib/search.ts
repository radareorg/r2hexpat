/** search.ts - independent, partially defined instances for masked binary searches. */
import * as A from "./ast";
import { PatternInstance, LayoutOptions } from "./evaluator";
import { Pattern } from "./patterns";
import { Memory, SparseMemory } from "./memory";
import { parseAssignments, parseExpression } from "./parser";
import { jsonValue } from "./output";

export interface SearchOptions extends LayoutOptions {
  /** Maximum number of scalar fields (default: 65536). */
  maxFields?: number;
}
export type FieldState = "unset" | "partial" | "set";
export interface SearchField {
  path: string;
  type: string;
  offset: number;
  size: number;
  bits?: number;
  defined: boolean;
  value?: any;
}
export interface SearchEncoding { bytes: Uint8Array; mask: Uint8Array; }
interface Value extends SearchEncoding { offset: number; value: any; }

/** Scratch storage never accesses the host; layout and value expressions cannot read it. */
class ScratchMemory implements Memory {
  private data = new SparseMemory();
  readable = false;
  constructor(private limit: number) {}
  size(): number { return this.limit; }
  read(addr: number, size: number): Uint8Array {
    if (!this.readable) throw new Error("search layouts and expressions cannot read input data");
    return this.data.read(addr, size);
  }
  write(addr: number, bytes: Uint8Array): void {
    if (addr < 0 || addr + bytes.length > this.limit) throw new Error("field exceeds search layout");
    this.data.write(addr, bytes);
  }
  reset(): void { this.data = new SparseMemory(); }
}

/**
 * A fixed type instantiated without a backing address. Fields start unset,
 * including zero-valued fields. Only explicit assignments contribute mask bits.
 */
export class SearchPattern {
  readonly type: string;
  readonly size: number;
  readonly alignment: number;
  private readonly context: PatternInstance;
  private readonly memory: ScratchMemory;
  private readonly nodes = new Map<string, Pattern>();
  private readonly leaves = new Map<string, Pattern>();
  private values = new Map<string, Value>();

  constructor(program: A.Program, type: string, options: SearchOptions = {}) {
    const maxSize = options.maxSize === undefined ? 0x100000 : options.maxSize;
    const maxFields = options.maxFields === undefined ? 0x10000 : options.maxFields;
    if (!Number.isSafeInteger(maxSize) || maxSize <= 0 || !Number.isSafeInteger(maxFields) || maxFields <= 0)
      throw new Error("search limits must be positive integers");
    const abi = program.pragmas.filter(([k]) => k === "abi").map(([, v]) => v.trim()).pop();
    if (abi && abi !== "packed" && options.alignment === undefined)
      throw new Error("specify --align (API: alignment) for this layout; target ABI is not inferred");
    this.memory = new ScratchMemory(maxSize);
    this.context = new PatternInstance(program, this.memory, {}, () => undefined);
    this.context.prepareTypes();
    // Bound construction too, including arrays of zero-sized aggregate entries.
    this.context.arrayLimit = this.context.arrayLimit > 0 ? Math.min(this.context.arrayLimit, maxFields) : maxFields;
    if (!(this.context.patternLimit > 0)) this.context.patternLimit = 0x100000;
    const root = this.context.instantiateType(type, options);
    if (!root.isComposite() || !root.size) throw new Error("search type must be a nonempty struct, union or bitfield");
    this.type = root.typeName;
    this.size = root.size;
    this.alignment = root.alignment;
    const collect = (p: Pattern, path: string): void => {
      if (p.kind === "padding") return;
      if (p.offset < 0 || p.offset + p.size > this.size) throw new Error("field outside its search layout: " + path);
      this.nodes.set(path, p);
      if (p.kind === "array") {
        if (p.entryCount() > maxFields) throw new Error("search layout exceeds maximum field count " + maxFields);
        for (let i = 0; i < p.entryCount(); i++) collect(p.entry(i)!, path + "[" + i + "]");
      } else if (p.isComposite()) {
        for (const c of p.children || []) if (c.name) collect(c, path ? path + "." + c.name : c.name);
      } else {
        this.leaves.set(path, p);
        if (this.leaves.size > maxFields) throw new Error("search layout exceeds maximum field count " + maxFields);
      }
    };
    collect(root, "");
    this.memory.readable = true;
  }

  private node(path: string): Pattern {
    const p = this.nodes.get(path);
    if (!p) throw new Error("unknown search field '" + path + "'");
    return p;
  }
  private inside(path: string, parent: string): boolean {
    return !parent || path === parent || path.startsWith(parent + ".") || path.startsWith(parent + "[");
  }

  /** Assign a leaf or merge a partial object/array. Updates are atomic. */
  set(fields: Record<string, any>): this;
  set(path: string, value: any): this;
  set(path: string | Record<string, any>, value?: any): this {
    const next = new Map(this.values);
    const assign = (key: string, v: any): void => {
      const p = this.node(key);
      if (v === null && p.kind === "pointer") v = 0n;
      if (v === undefined || v === null) throw new Error("use unset() to leave a search field undefined");
      if (p.isComposite()) {
        if (typeof v !== "object" || v instanceof A.Chr) throw new Error("field '" + key + "' needs an object or array");
        if (p.kind === "array" && !Array.isArray(v)) throw new Error("field '" + key + "' needs an array");
        for (const child of Object.keys(v)) {
          const target = p.kind === "array" ? key + "[" + child + "]" : key ? key + "." + child : child;
          assign(target, v[child]);
        }
      } else {
        if (typeof v === "object" && !(v instanceof A.Chr)) throw new Error("field '" + key + "' needs a scalar value");
        if (typeof v === "number" && ["unsigned", "signed", "enum", "pointer", "bitfield_field"].includes(p.kind) && !Number.isSafeInteger(v))
          throw new Error("integer field '" + key + "' requires a safe integer number or bigint");
        if ((p.kind === "char" || p.kind === "char16") && typeof v === "string") {
          if (v.length !== 1) throw new Error("field '" + key + "' needs one character");
          v = new A.Chr(v.charCodeAt(0), p.kind === "char16");
        }
        if ((p.kind === "string" || p.kind === "wstring") && typeof v === "string" && v.length * (p.kind === "wstring" ? 2 : 1) > p.size)
          throw new Error("string exceeds field '" + key + "'");
        next.set(key, this.encodeField(p, v));
      }
    };
    if (typeof path === "string") assign(path, value);
    else assign("", path);
    this.merge(next); // reject conflicting overlapping constraints before committing
    this.values = next;
    return this;
  }

  /** Remove constraints from a field, aggregate, or the whole instance. */
  unset(path = ""): this {
    this.node(path);
    for (const key of this.values.keys()) if (this.inside(key, path)) this.values.delete(key);
    return this;
  }

  state(path = ""): FieldState {
    this.node(path);
    let total = 0, defined = 0;
    for (const key of this.leaves.keys()) if (this.inside(key, path)) { total++; if (this.values.has(key)) defined++; }
    return !defined ? "unset" : defined === total ? "set" : "partial";
  }
  isDefined(path: string): boolean { return this.state(path) === "set"; }

  /** Unset leaves return undefined; aggregates return only their defined values. */
  get(path = ""): any {
    const p = this.node(path);
    if (!p.isComposite()) return this.values.get(path)?.value;
    if (this.state(path) === "unset") return undefined;
    const out: any = p.kind === "array" ? [] : Object.create(null);
    if (p.kind === "array") {
      for (let i = 0; i < p.entryCount(); i++) { const v = this.get(path + "[" + i + "]"); if (v !== undefined) out[i] = v; }
    } else {
      for (const c of p.children || []) if (c.name && c.kind !== "padding") {
        const v = this.get(path ? path + "." + c.name : c.name);
        if (v !== undefined) out[c.name] = v;
      }
    }
    return out;
  }

  /** Evaluate constants, enum names and arithmetic without reading input data. */
  evaluateExpression(src: string): any {
    this.memory.readable = false;
    try { return this.context.decay(this.context.evalExpr(parseExpression(src, this.context.typeNames()))); }
    finally { this.memory.readable = true; }
  }

  /** Apply CLI-style field=expression assignments as one transaction. */
  assign(src: string): this {
    const assignments = parseAssignments(src, this.context.typeNames());
    if (!assignments.length) throw new Error("expected at least one field=expression assignment");
    const path = (e: A.Expr): string => {
      if (e.k === "id") return e.name;
      if (e.k === "member") return path(e.obj) + "." + e.name;
      if (e.k === "index") {
        this.memory.readable = false;
        let i: number;
        try { i = Number(this.context.toInt(this.context.decay(this.context.evalExpr(e.idx)))); }
        finally { this.memory.readable = true; }
        if (!Number.isSafeInteger(i) || i < 0) throw new Error("field index must be a nonnegative integer");
        return path(e.obj) + "[" + i + "]";
      }
      throw new Error("expected a field path");
    };
    const fields: Record<string, any> = Object.create(null);
    for (const s of assignments) {
      if (s.op !== "=") throw new Error("search fields use field=expression; unset fields have no prior value");
      this.memory.readable = false;
      let value: any;
      try { value = this.context.decay(this.context.evalExpr(s.value)); }
      finally { this.memory.readable = true; }
      fields[path(s.target)] = value;
    }
    return this.set(fields);
  }

  private encodeField(p: Pattern, v: any): Value {
    const ordered = p.kind === "bitfield_field" && p.bitMode?.order?.size;
    const offset = ordered ? p.bitMode!.root : p.offset;
    const size = ordered ? Math.ceil(Number(ordered) / 8) : p.size;
    this.memory.reset();
    this.context.writePattern(p, v);
    const raw = this.context.value(p);
    const value = raw instanceof A.Chr ? String.fromCharCode(raw.c) : raw;
    const bytes = this.memory.read(offset, size);
    let mask: Uint8Array;
    if (p.kind === "bitfield_field") {
      this.memory.reset();
      this.context.writePattern(p, (1n << BigInt(p.bits)) - 1n);
      mask = this.memory.read(offset, size);
    } else mask = new Uint8Array(size).fill(0xff);
    return { offset, bytes, mask, value };
  }

  private merge(values: Map<string, Value>): SearchEncoding {
    const bytes = new Uint8Array(this.size), mask = new Uint8Array(this.size);
    for (const [path, v] of values) {
      for (let i = 0; i < v.bytes.length; i++) {
        const at = v.offset + i, m = v.mask[i];
        if (((bytes[at] ^ v.bytes[i]) & mask[at] & m) !== 0)
          throw new Error("conflicting search field '" + path + "' at byte " + at + "; unset overlapping fields first");
        bytes[at] = (bytes[at] & ~m) | (v.bytes[i] & m);
        mask[at] |= m;
      }
    }
    return { bytes, mask };
  }

  encode(): SearchEncoding { return this.merge(this.values); }
  /** r2 /x accepts arbitrary bit masks, including partially defined bitfield bytes. */
  toR2(): string { const { bytes, mask } = this.encode(); return hex(bytes) + ":" + hex(mask); }
  fields(): SearchField[] {
    return Array.from(this.leaves, ([path, p]) => {
      const v = this.values.get(path);
      const field: SearchField = { path, type: p.typeName, offset: p.offset, size: p.size, defined: !!v };
      if (p.kind === "bitfield_field") {
        field.bits = p.bits;
        const encoded = v || this.encodeField(p, 0n);
        const first = encoded.mask.findIndex((m) => m !== 0);
        let last = encoded.mask.length - 1;
        while (last >= 0 && !encoded.mask[last]) last--;
        if (first >= 0) { field.offset = encoded.offset + first; field.size = last - first + 1; }
      }
      if (v) field.value = jsonValue(v.value);
      return field;
    });
  }
  toJSON(): any {
    const { bytes, mask } = this.encode();
    return { type: this.type, size: this.size, alignment: this.alignment, state: this.state(),
      bytes: hex(bytes), mask: hex(mask), pattern: this.toR2(), fields: this.fields() };
  }
}

function hex(bytes: Uint8Array): string { return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); }
