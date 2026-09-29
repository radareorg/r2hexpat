/** patterns.ts - the pattern tree produced by evaluating a pattern file. */
export type PKind =
  | "unsigned" | "signed" | "float" | "bool" | "char" | "char16"
  | "string" | "wstring" | "padding" | "enum"
  | "struct" | "union" | "array" | "bitfield" | "bitfield_field" | "pointer";

// section ids
export const MAIN_SECTION = 0;
export const HEAP_SECTION = -1;

export interface EnumInfo {
  name: string;
  entries: { name: string; lo: bigint; hi: bigint }[];
}

export interface BitMode {
  be: boolean;
  root: number;                        // byte offset of the outermost bitfield
  order?: { lsbFirst: boolean; size: number };
}

export class Pattern {
  name = "";
  displayName?: string;   // [[name(...)]] / std::core::set_display_name
  section = MAIN_SECTION;
  offset = 0;
  size = 0;
  be = false;
  parent?: Pattern;
  attrs?: { name: string; args: any[] }[];
  local = false;          // lives in heap memory (local variable / pattern-local member)
  loose = false;
  patternLocal = false;   // struct member declared with an initializer (not data)
  imported = false;       // instance of a type imported with `import * from`          // `auto` copy: assignments are stored untruncated
  hasOverride = false;
  override: any;
  // composite
  children?: Pattern[];
  private byName?: Map<string, Pattern>;
  // arrays: materialized entries, or a prototype for lazy static arrays
  count = 0;
  proto?: Pattern;
  entries?: Map<number, Pattern>;
  // enums
  enumInfo?: EnumInfo;
  // bitfield fields
  bitPos = 0;             // bit position from the root bitfield offset
  bits = 0;
  bitMode?: BitMode;
  fieldKind?: "unsigned" | "signed" | "bool" | "enum";
  // enums over a non-builtin underlying type
  inner?: Pattern;
  // pointers
  pointee?: Pattern;
  // display
  hidden = false;
  sealed = false;
  formatFn?: string;
  transformFn?: string;
  comment?: string;
  color?: string;

  constructor(public kind: PKind, public typeName: string) {}

  isComposite(): boolean {
    return this.kind === "struct" || this.kind === "union" || this.kind === "array" || this.kind === "bitfield";
  }

  attr(name: string): { name: string; args: any[] } | undefined {
    if (this.attrs) for (const a of this.attrs) if (a.name === name) return a;
    return undefined;
  }

  member(name: string): Pattern | undefined {
    if (!this.children) return undefined;
    if (!this.byName || this.byName.size !== this.children.length) {
      this.byName = new Map();
      for (const c of this.children) if (c.name && !this.byName.has(c.name)) this.byName.set(c.name, c);
    }
    return this.byName.get(name);
  }

  addChild(c: Pattern): void {
    if (!this.children) this.children = [];
    this.children.push(c);
    this.byName = undefined;
  }

  entryCount(): number {
    if (this.kind === "array") return this.proto ? this.count : (this.children ? this.children.length : 0);
    return this.children ? this.children.length : 0;
  }

  /** Array entry (materializes lazy static array entries on demand). */
  entry(i: number): Pattern | undefined {
    if (this.kind !== "array" || !this.proto) return this.children ? this.children[i] : undefined;
    if (i < 0 || i >= this.count) return undefined;
    if (!this.entries) this.entries = new Map();
    let e = this.entries.get(i);
    if (!e) {
      e = this.proto.clone(this.proto.offset + i * this.proto.size);
      e.name = "[" + i + "]";
      e.parent = this;
      this.entries.set(i, e);
    }
    return e;
  }

  /** Deep copy, relocated to `offset` (children shift by the same delta). */
  clone(offset = this.offset, section = this.section): Pattern {
    const delta = offset - this.offset;
    const p = new Pattern(this.kind, this.typeName);
    Object.assign(p, this);
    p.offset = offset;
    p.section = section;
    (p as any).byName = undefined;
    if (this.children) p.children = this.children.map((c) => { const cc = c.clone(c.offset + delta, section); cc.parent = p; return cc; });
    if (this.proto) p.proto = this.proto.clone(this.proto.offset + delta, section);
    if (this.entries) {
      p.entries = new Map();
      this.entries.forEach((e, i) => { const ce = e.clone(e.offset + delta, section); ce.parent = p; p.entries!.set(i, ce); });
    }
    if (this.pointee) p.pointee = this.pointee.clone();
    return p;
  }

  setLocal(local: boolean, loose = false): void {
    this.local = local;
    if (loose) this.loose = true;
    if (this.children) for (const c of this.children) c.setLocal(local, loose);
    if (this.proto) this.proto.setLocal(local, loose);
    if (this.entries) this.entries.forEach((e) => e.setLocal(local, loose));
  }
}
