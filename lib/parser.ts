/** parser.ts - recursive descent parser for the ImHex pattern language. */
import { Token, PatternError, SourceResolver, preprocess } from "./lexer";
import * as A from "./ast";

export const BUILTIN_TYPES = new Set([
  "u8", "u16", "u24", "u32", "u48", "u64", "u96", "u128",
  "s8", "s16", "s24", "s32", "s48", "s64", "s96", "s128",
  "i8", "i16", "i24", "i32", "i48", "i64", "i96", "i128",
  "float", "double", "float16", "char", "char16", "bool", "str", "padding", "auto",
]);

// binary operator precedence, lowest first. Unlike C, the bitwise operators
// bind tighter than comparisons: `x & 0x80 != 0` is `(x & 0x80) != 0`.
const PREC: string[][] = [
  ["||"], ["^^"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="],
  ["|"], ["^"], ["&"], ["<<", ">>"], ["+", "-"], ["*", "/", "%"],
];
const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "|=", "^="]);

interface ImportState { seen: Set<string>; resolve?: SourceResolver; pragmas: [string, string][]; defines: Map<string, string>; once: Set<string>; }

class Parser {
  private i = 0;
  private ns: string[] = [];
  types = new Set<string>(); // names known to be types (for `sizeof(T<..>)`)
  private noGt = 0;   // inside template arguments: '>' closes the list
  private noBor = 0;  // inside match cases: '|' separates alternatives
  private toks: Token[];
  constructor(toks: Token[], private st: ImportState, private importAlias?: string) {
    this.toks = mergeScopes(toks);
  }

  // ---- token helpers ----
  private peek(n = 0): Token { return this.toks[Math.min(this.i + n, this.toks.length - 1)]; }
  private next(): Token { return this.toks[Math.min(this.i++, this.toks.length - 1)]; }
  private loc(t = this.peek()): A.Loc { return { line: t.line, col: t.col, src: t.src }; }
  private err(msg: string, t = this.peek()): never {
    throw new PatternError(msg + (t.k === "eof" ? " at end of input" : ", got '" + t.t + "'"), t);
  }
  private isOp(t: string, n = 0): boolean { const p = this.peek(n); return p.k === "op" && p.t === t; }
  private isKw(t: string, n = 0): boolean { const p = this.peek(n); return p.k === "kw" && p.t === t; }
  private acceptOp(t: string): boolean { if (this.isOp(t)) { this.i++; return true; } return false; }
  private acceptKw(t: string): boolean { if (this.isKw(t)) { this.i++; return true; } return false; }
  private expectOp(t: string): Token { if (!this.isOp(t)) this.err("expected '" + t + "'"); return this.next(); }
  private ident(): string { const t = this.peek(); if (t.k !== "id") this.err("expected identifier"); this.i++; return t.t; }
  private semis(): void { while (this.acceptOp(";")) { /* superfluous */ } }
  private isAttrOpen(): boolean { return this.isOp("[") && this.isOp("[", 1); }

  private qualify(name: string): string { return this.ns.length ? this.ns.join("::") + "::" + name : name; }
  private isTypeName(name: string): boolean {
    if (BUILTIN_TYPES.has(name) || this.types.has(name)) return true;
    for (let n = this.ns.length; n > 0; n--) if (this.types.has(this.ns.slice(0, n).join("::") + "::" + name)) return true;
    return false;
  }
  private declareType(name: string): string {
    const q = this.qualify(name);
    this.types.add(q);
    this.types.add(name);
    return q;
  }

  // ---- types ----
  parseType(): A.TypeApp {
    const loc = this.loc();
    let endian: "le" | "be" | undefined;
    if (this.acceptKw("be")) endian = "be";
    else if (this.acceptKw("le")) endian = "le";
    let name: string;
    if (this.acceptKw("unsigned")) name = "u32";
    else if (this.acceptKw("signed")) name = "s32";
    else if (this.acceptKw("auto")) name = "auto";
    else name = this.ident();
    const t: A.TypeApp = { name, endian, loc };
    if (this.isOp("<")) t.args = this.parseTemplateArgs();
    return t;
  }

  private parseTemplateArgs(): (A.TypeApp | A.Expr)[] {
    this.expectOp("<");
    const args: (A.TypeApp | A.Expr)[] = [];
    if (this.acceptOp(">")) return args;
    for (;;) {
      const p = this.peek();
      if ((p.k === "id" && this.isTypeName(p.t) && !this.isOp("(", 1)) || (p.k === "kw" && (p.t === "be" || p.t === "le"))) {
        args.push(this.parseType());
      } else {
        // an expression; relational '>' closes the list, so parse above that level
        this.noGt++;
        try { args.push(this.parseTernary()); } finally { this.noGt--; }
      }
      if (this.acceptOp(",")) continue;
      // `>>` closes two template lists
      if (this.isOp(">>")) { const t = this.peek(); this.toks.splice(this.i, 1, { ...t, t: ">" }, { ...t, t: ">", col: t.col + 1 }); }
      this.expectOp(">");
      return args;
    }
  }

  private parseTemplateParams(): A.TParam[] | undefined {
    if (!this.acceptOp("<")) return undefined;
    const ps: A.TParam[] = [];
    const seen = new Set<string>();
    while (!this.acceptOp(">")) {
      const isValue = this.acceptKw("auto");
      const t = this.peek();
      const name = this.ident();
      if (seen.has(name)) throw new PatternError("redefinition of template parameter '" + name + "'", t);
      seen.add(name);
      ps.push({ name, isValue });
      if (!isValue) this.types.add(name);
      if (!this.acceptOp(",")) { this.expectOp(">"); break; }
    }
    return ps;
  }

  // ---- attributes ----
  parseAttrs(into?: A.Attr[]): A.Attr[] | undefined {
    let attrs = into;
    while (this.isAttrOpen()) {
      this.i += 2;
      attrs = attrs || [];
      for (;;) {
        let name = this.ident();
        const args: A.Expr[] = [];
        if (this.acceptOp("(")) {
          if (!this.acceptOp(")")) {
            for (;;) { args.push(this.parseExpr()); if (!this.acceptOp(",")) break; }
            this.expectOp(")");
          }
        }
        attrs.push({ name, args });
        if (!this.acceptOp(",")) break;
      }
      this.expectOp("]");
      this.expectOp("]");
    }
    return attrs;
  }

  // ---- expressions ----
  parseExpr(): A.Expr { return this.parseTernary(); }
  private parseTernary(): A.Expr {
    const c = this.parseBinary(0);
    if (this.isOp("?")) {
      const loc = this.loc(this.next());
      const a = this.parseTernary();
      this.expectOp(":");
      const b = this.parseTernary();
      return { k: "tern", c, a, b, loc };
    }
    return c;
  }
  parseBinary(level: number): A.Expr {
    if (level >= PREC.length) return this.parseUnary();
    let l = this.parseBinary(level + 1);
    for (;;) {
      const p = this.peek();
      if (p.k !== "op" || PREC[level].indexOf(p.t) < 0) break;
      if (this.noGt && (p.t === ">" || p.t === ">=" || p.t === ">>")) break;
      if (this.noBor && p.t === "|") break;
      this.i++;
      const r = this.parseBinary(level + 1);
      l = { k: "bin", op: p.t, l, r, loc: this.loc(p) };
    }
    return l;
  }
  private parseUnary(): A.Expr {
    const p = this.peek();
    if (p.k === "op" && (p.t === "-" || p.t === "!" || p.t === "~" || p.t === "+")) {
      this.i++;
      const e = this.parseUnary();
      if (p.t === "+") return e;
      // fold negative literals so `-0x80` stays a literal
      if (p.t === "-" && e.k === "lit" && (typeof e.v === "bigint" || typeof e.v === "number")) return { k: "lit", v: -(e.v as any), loc: this.loc(p) };
      return { k: "un", op: p.t, e, loc: this.loc(p) };
    }
    return this.parsePostfix(this.parsePrimary());
  }
  private parsePostfix(e: A.Expr): A.Expr {
    for (;;) {
      if (this.isOp(".")) {
        const loc = this.loc(this.next());
        const t = this.peek();
        let name: string;
        if (t.k === "id" || (t.k === "kw" && t.t === "parent")) { this.i++; name = t.t; } else name = this.ident();
        e = { k: "member", obj: e, name, loc };
      } else if (this.isOp("[") && !this.isOp("[", 1)) {
        const loc = this.loc(this.next());
        const idx = this.parseExpr();
        this.expectOp("]");
        e = { k: "index", obj: e, idx, loc };
      } else return e;
    }
  }
  private parseCallArgs(): A.Expr[] {
    this.expectOp("(");
    const args: A.Expr[] = [];
    if (this.acceptOp(")")) return args;
    for (;;) {
      args.push(this.parseExpr());
      if (this.acceptOp(",")) continue;
      this.expectOp(")");
      return args;
    }
  }
  private parsePrimary(): A.Expr {
    const t = this.next();
    const loc = this.loc(t);
    switch (t.k) {
      case "num": return { k: "lit", v: t.v!, loc };
      case "str": {
        let s = t.t;
        while (this.peek().k === "str") s += this.next().t; // adjacent literal concat
        return { k: "lit", v: s, loc };
      }
      case "char": return { k: "lit", v: new A.Chr(t.t.charCodeAt(0)), loc };
      case "op":
        if (t.t === "(") {
          // parentheses lift the template-argument and match-case restrictions
          const sg = this.noGt, sb = this.noBor;
          this.noGt = 0; this.noBor = 0;
          try { const e = this.parseExpr(); this.expectOp(")"); return e; } finally { this.noGt = sg; this.noBor = sb; }
        }
        if (t.t === "$") return { k: "dollar", loc };
        if (t.t === "{") {
          const items: A.Expr[] = [];
          if (!this.acceptOp("}")) {
            for (;;) { items.push(this.parseExpr()); if (this.acceptOp(",")) { if (this.acceptOp("}")) break; continue; } this.expectOp("}"); break; }
          }
          return { k: "list", items, loc };
        }
        break;
      case "kw":
        switch (t.t) {
          case "true": return { k: "lit", v: true, loc };
          case "false": return { k: "lit", v: false, loc };
          case "null": return { k: "lit", v: null, loc };
          case "this": return { k: "this", loc };
          case "parent": return { k: "parent", loc };
          case "sizeof": case "addressof": case "typenameof": {
            this.expectOp("(");
            const p = this.peek();
            let r: A.Expr;
            if ((p.k === "id" && this.isTypeName(p.t) && (this.isOp("<", 1) || this.isOp(")", 1))) || (p.k === "kw" && (p.t === "be" || p.t === "le"))) {
              r = { k: "typeop", op: t.t, t: this.parseType(), loc };
            } else {
              r = { k: "typeop", op: t.t, e: this.parseExpr(), loc };
            }
            this.expectOp(")");
            return r;
          }
          case "be": case "le": case "unsigned": case "signed": {
            this.i--;
            const ty = this.parseType();
            if (this.isOp("(")) return { k: "call", name: ty.name, args: this.parseCallArgs(), targs: ty.args, endian: ty.endian, loc };
            return { k: "type", t: ty, loc };
          }
        }
        break;
      case "id": {
        let targs: (A.TypeApp | A.Expr)[] | undefined;
        if (this.isOp("<") && this.isTypeName(t.t)) targs = this.parseTemplateArgs();
        if (this.isOp("(")) return { k: "call", name: t.t, args: this.parseCallArgs(), targs, loc };
        if (targs) return { k: "type", t: { name: t.t, args: targs, loc }, loc };
        return { k: "id", name: t.t, loc };
      }
    }
    return this.err("unexpected token in expression", t);
  }

  // ---- statements ----
  private block(): A.Stmt[] {
    if (this.acceptOp("{")) {
      const body: A.Stmt[] = [];
      while (!this.isOp("}")) {
        if (this.peek().k === "eof") this.err("expected '}'");
        this.statement(body);
      }
      this.next();
      this.semis();
      return body;
    }
    const body: A.Stmt[] = [];
    this.statement(body);
    return body;
  }

  /** Is the token stream at an assignment (`lvalue op= expr`)? */
  private atAssignment(): boolean {
    const p = this.peek();
    if (p.k === "op" && p.t === "$") return ASSIGN_OPS.has(this.peek(1).t) && this.peek(1).k === "op";
    if (p.k !== "id") return false;
    // scan a member/index path: id ( .id | [expr] )* op=
    let j = 1, depth = 0;
    for (;;) {
      const t = this.peek(j);
      if (t.k === "eof") return false;
      if (depth === 0) {
        if (t.k === "op" && ASSIGN_OPS.has(t.t)) return true;
        if (t.k === "op" && t.t === ".") { j += 2; continue; }
        if (t.k === "op" && t.t === "[") { if (this.peek(j + 1).k === "op" && this.peek(j + 1).t === "[") return false; depth++; j++; continue; }
        return false;
      }
      if (t.k === "op" && t.t === "[") depth++;
      else if (t.k === "op" && t.t === "]") depth--;
      else if (t.k === "op" && (t.t === ";" || t.t === "{" || t.t === "}")) return false;
      j++;
    }
  }

  private parseAssignment(): A.Stmt {
    const loc = this.loc();
    let target: A.Expr;
    if (this.acceptOp("$")) target = { k: "dollar", loc };
    else target = this.parsePostfix({ k: "id", name: this.ident(), loc });
    const op = this.next().t;
    const value = this.parseExpr();
    return { s: "assign", loc, target, op, value };
  }

  /** Parse one statement (or declaration) and append it to `out`. */
  statement(out: A.Stmt[], inBitfield = false): void {
    const p = this.peek();
    const loc = this.loc(p);
    if (this.acceptOp(";")) return;
    if (p.k === "kw") {
      switch (p.t) {
        case "struct": case "union": case "enum": case "bitfield": case "using": case "fn": case "namespace": case "import":
          if (p.t !== "using" || this.peek(1).k === "id") { this.declaration(out); return; }
          break;
        case "if": {
          this.i++;
          this.expectOp("(");
          const cond = this.parseExpr();
          this.expectOp(")");
          const then = this.blockIn(inBitfield);
          let els: A.Stmt[] | undefined;
          if (this.acceptKw("else")) els = this.blockIn(inBitfield);
          out.push({ s: "if", loc, cond, then, else: els });
          return;
        }
        case "while": {
          this.i++;
          this.expectOp("(");
          const cond = this.parseExpr();
          this.expectOp(")");
          out.push({ s: "while", loc, cond, body: this.blockIn(inBitfield) });
          return;
        }
        case "for": {
          this.i++;
          this.expectOp("(");
          const init: A.Stmt[] = [];
          if (!this.isOp(",") && !this.isOp(";")) this.simpleStatement(init, false, false);
          if (!this.acceptOp(",")) this.expectOp(";");
          const cond = this.parseExpr();
          if (!this.acceptOp(",")) this.expectOp(";");
          const step: A.Stmt[] = [];
          if (!this.isOp(")")) this.simpleStatement(step);
          this.expectOp(")");
          out.push({ s: "for", loc, init: init[0], cond, step: step[0], body: this.blockIn(inBitfield) });
          return;
        }
        case "match": {
          this.i++;
          out.push(this.parseMatch(loc, inBitfield));
          return;
        }
        case "try": {
          this.i++;
          const body = this.blockIn(inBitfield);
          let handler: A.Stmt[] = [];
          if (this.acceptKw("catch")) handler = this.blockIn(inBitfield);
          out.push({ s: "try", loc, body, handler });
          return;
        }
        case "return": {
          this.i++;
          let value: A.Expr | undefined;
          if (!this.isOp(";") && !this.isOp("}")) value = this.parseExpr();
          this.endStatement();
          out.push({ s: "return", loc, value });
          return;
        }
        case "break": this.i++; this.endStatement(); out.push({ s: "break", loc }); return;
        case "continue": this.i++; this.endStatement(); out.push({ s: "continue", loc }); return;
      }
    }
    if (this.isOp("{")) { out.push({ s: "block", loc, body: this.block() }); return; }
    this.simpleStatement(out, inBitfield);
    this.endStatement();
  }

  private blockIn(inBitfield: boolean): A.Stmt[] {
    if (!inBitfield) return this.block();
    if (this.acceptOp("{")) {
      const body: A.Stmt[] = [];
      while (!this.acceptOp("}")) { if (this.peek().k === "eof") this.err("expected '}'"); this.statement(body, true); }
      this.semis();
      return body;
    }
    const body: A.Stmt[] = [];
    this.statement(body, true);
    return body;
  }

  private endStatement(): void {
    if (!this.acceptOp(";")) {
      // a closing brace ends the last statement of a block
      if (this.isOp("}") || this.peek().k === "eof") return;
      this.err("expected ';' at end of statement");
    }
    this.semis();
  }

  private parseMatch(loc: A.Loc, inBitfield: boolean): A.Stmt {
    this.expectOp("(");
    const subjects: A.Expr[] = [];
    for (;;) { subjects.push(this.parseExpr()); if (!this.acceptOp(",")) break; }
    this.expectOp(")");
    this.expectOp("{");
    const cases: A.MatchCase[] = [];
    while (!this.acceptOp("}")) {
      const cloc = this.loc();
      this.expectOp("(");
      const pats: A.MatchPat[] = [];
      for (;;) {
        if (this.peek().k === "id" && this.peek().t === "_" && (this.isOp(",", 1) || this.isOp(")", 1))) {
          this.i++;
          pats.push({ any: true });
        } else {
          const alts: { lo: A.Expr; hi?: A.Expr }[] = [];
          for (;;) {
            this.noBor++;
            let lo: A.Expr, hi: A.Expr | undefined;
            try {
              lo = this.parseTernary();
              if (this.acceptOp("...")) hi = this.parseTernary();
            } finally { this.noBor--; }
            alts.push({ lo, hi });
            if (!this.acceptOp("|")) break;
          }
          pats.push({ alts });
        }
        if (!this.acceptOp(",")) break;
      }
      this.expectOp(")");
      this.expectOp(":");
      const body = this.blockIn(inBitfield);
      cases.push({ pats: pats.every((x) => x.any) ? null : pats, body, loc: cloc });
    }
    this.semis();
    return { s: "match", loc, subjects, cases };
  }

  /** Assignment, function call or variable declaration (no trailing ';'). */
  private simpleStatement(out: A.Stmt[], inBitfield = false, multi = true): void {
    const p = this.peek();
    const loc = this.loc(p);
    if (this.atAssignment()) { out.push(this.parseAssignment()); return; }
    // function call statement: name(...)  (but not a cast-style decl)
    if (p.k === "id" && this.isOp("(", 1)) {
      const e = this.parsePostfix(this.parsePrimary());
      out.push({ s: "expr", loc, e });
      return;
    }
    if (inBitfield) {
      // `name : bits`, `signed name : bits`, `Type name : bits`, `padding : bits`
      if (p.k === "id" && this.isOp(":", 1)) {
        this.i += 2;
        const bits = this.parseExpr();
        const d: A.DeclStmt = { s: "decl", loc, type: { name: p.t === "padding" ? "padding" : "u128", loc }, name: p.t === "padding" ? "" : p.t, bits };
        d.attrs = this.parseAttrs();
        out.push(d);
        return;
      }
      if ((p.k === "kw" && (p.t === "signed" || p.t === "unsigned")) || (p.k === "id" && this.peek(1).k === "id" && this.isOp(":", 2))) {
        let bitSign: "signed" | "unsigned" | undefined;
        let type: A.TypeApp;
        if (p.k === "kw") { this.i++; bitSign = p.t as any; type = { name: bitSign === "signed" ? "s128" : "u128", loc }; }
        else type = this.parseType();
        const name = this.ident();
        this.expectOp(":");
        const bits = this.parseExpr();
        const d: A.DeclStmt = { s: "decl", loc, type, name, bits, bitSign };
        d.attrs = this.parseAttrs();
        out.push(d);
        return;
      }
    }
    this.parseDeclaration(out, multi);
  }

  private parseDeclaration(out: A.Stmt[], multi = true): void {
    const loc = this.loc();
    const isConst = this.acceptKw("const");
    const type = this.parseType();
    const decls: A.DeclStmt[] = [];
    for (;;) {
      const d: A.DeclStmt = { s: "decl", loc: this.loc(), type, name: "" };
      if (isConst) d.isConst = true;
      if (this.acceptOp("*")) {
        d.name = this.ident();
        if (this.isOp("[") && !this.isAttrOpen()) d.array = this.parseArraySpec();
        this.expectOp(":");
        d.pointer = this.parseType();
      } else if (this.peek().k === "id") {
        d.name = this.ident();
        if (this.isOp("[") && !this.isAttrOpen()) d.array = this.parseArraySpec();
      } else if (this.isOp("[") && !this.isAttrOpen()) {
        d.array = this.parseArraySpec(); // `padding[N];`
      }
      d.attrs = this.parseAttrs();
      if (this.acceptOp("@")) {
        d.placement = this.parseExpr();
        if (this.acceptKw("in")) d.section = this.parseExpr();
      } else if (this.acceptKw("in")) {
        d.isIn = true;
        if (this.acceptOp("=")) d.init = this.parseExpr();
      } else if (this.acceptKw("out")) {
        d.isOut = true;
      } else if (this.acceptOp("=")) {
        d.init = this.parseExpr();
      }
      d.attrs = this.parseAttrs(d.attrs);
      decls.push(d);
      if (multi && this.isOp(",") && this.peek(1).k === "id") { this.i++; continue; }
      break;
    }
    if (decls.length === 1) out.push(decls[0]);
    else out.push({ s: "multi", loc, decls });
  }

  private parseArraySpec(): A.ArraySpec {
    this.expectOp("[");
    let spec: A.ArraySpec;
    if (this.acceptOp("]")) return { k: "unsized" };
    if (this.acceptKw("while")) {
      this.expectOp("(");
      spec = { k: "while", cond: this.parseExpr() };
      this.expectOp(")");
    } else spec = { k: "fixed", size: this.parseExpr() };
    this.expectOp("]");
    return spec;
  }

  // ---- declarations ----
  declaration(out: A.Stmt[]): void {
    const p = this.next();
    const loc = this.loc(p);
    switch (p.t) {
      case "struct": case "union": {
        const name = this.declareType(this.ident());
        const tparams = this.parseTemplateParams();
        let inherits: A.TypeApp[] | undefined;
        if (this.acceptOp(":")) {
          inherits = [];
          for (;;) { inherits.push(this.parseType()); if (!this.acceptOp(",")) break; }
        }
        const body: A.Stmt[] = [];
        this.expectOp("{");
        while (!this.acceptOp("}")) { if (this.peek().k === "eof") this.err("expected '}'"); this.statement(body); }
        const attrs = this.parseAttrs();
        this.endStatement();
        checkMembers(body);
        out.push({ s: p.t as "struct", loc, name, ns: this.ns.slice(), tparams, inherits, body, attrs });
        return;
      }
      case "bitfield": {
        const name = this.declareType(this.ident());
        const tparams = this.parseTemplateParams();
        const body: A.Stmt[] = [];
        this.expectOp("{");
        while (!this.acceptOp("}")) { if (this.peek().k === "eof") this.err("expected '}'"); this.statement(body, true); }
        const attrs = this.parseAttrs();
        this.endStatement();
        checkMembers(body);
        out.push({ s: "bitfield", loc, name, ns: this.ns.slice(), tparams, body, attrs });
        return;
      }
      case "enum": {
        const name = this.declareType(this.ident());
        const tparams = this.parseTemplateParams();
        this.expectOp(":");
        const underlying = this.parseType();
        this.expectOp("{");
        const entries: { name: string; value?: A.Expr; end?: A.Expr }[] = [];
        while (!this.acceptOp("}")) {
          const en = this.ident();
          let value: A.Expr | undefined, end: A.Expr | undefined;
          if (this.acceptOp("=")) {
            value = this.parseExpr();
            if (this.acceptOp("...")) end = this.parseExpr();
          }
          entries.push({ name: en, value, end });
          if (!this.acceptOp(",")) { this.expectOp("}"); break; }
        }
        const attrs = this.parseAttrs();
        this.endStatement();
        out.push({ s: "enum", loc, name, ns: this.ns.slice(), tparams, underlying, entries, attrs });
        return;
      }
      case "using": {
        const name = this.declareType(this.ident());
        const tparams = this.parseTemplateParams();
        let type: A.TypeApp | undefined;
        if (this.acceptOp("=")) type = this.parseType();
        const attrs = this.parseAttrs();
        this.endStatement();
        out.push({ s: "using", loc, name, ns: this.ns.slice(), tparams, type, attrs });
        return;
      }
      case "fn": {
        const name = this.qualify(this.ident());
        this.expectOp("(");
        const params: A.FnParam[] = [];
        const seen = new Set<string>();
        if (!this.acceptOp(")")) {
          for (;;) {
            const pt = this.peek();
            const fp: A.FnParam = { name: "" };
            if (this.acceptKw("ref")) fp.ref = true;
            fp.type = this.parseType();
            if (this.acceptOp("...")) fp.pack = true;
            if (this.peek().k === "id") fp.name = this.ident();
            if (this.acceptOp("=")) fp.def = this.parseExpr();
            if (fp.name) {
              if (seen.has(fp.name)) throw new PatternError("redefinition of parameter '" + fp.name + "'", pt);
              seen.add(fp.name);
            }
            params.push(fp);
            if (this.acceptOp(",")) continue;
            this.expectOp(")");
            break;
          }
        }
        const body = this.block();
        this.semis();
        out.push({ s: "fn", loc, name, ns: this.ns.slice(), params, body });
        return;
      }
      case "namespace": {
        let auto = false;
        if (this.acceptKw("auto")) auto = true;
        let name = this.ident();
        if (auto && this.importAlias !== undefined) name = this.importAlias;
        const parts = name ? name.split("::") : [];
        const save = this.ns;
        this.ns = save.concat(parts);
        this.expectOp("{");
        const inner: A.Stmt[] = [];
        while (!this.acceptOp("}")) { if (this.peek().k === "eof") this.err("expected '}'"); this.statement(inner); }
        // declarations are registered globally; other statements keep the namespace for name lookups
        for (const st of inner) {
          if (st.s === "struct" || st.s === "union" || st.s === "enum" || st.s === "bitfield" || st.s === "using" || st.s === "fn" || st.s === "imported" || st.s === "nsctx") out.push(st);
          else out.push({ s: "nsctx", loc: st.loc, ns: this.ns.slice(), body: [st] });
        }
        this.ns = save;
        this.semis();
        return;
      }
      case "import": {
        // import a.b.c [as X];  import * from a.b as X;
        let star = false;
        if (this.acceptOp("*")) { star = true; if (!this.acceptKw("from")) this.err("expected 'from'"); }
        let path = this.peek().k === "str" ? this.next().t : this.ident();
        while (this.acceptOp(".")) path += "/" + this.ident();
        let alias: string | undefined;
        if (this.acceptKw("as")) alias = this.ident();
        this.endStatement();
        this.importFile(path, loc, out, star ? (alias || path) : undefined, star ? undefined : alias);
        return;
      }
    }
    this.err("unexpected declaration", p);
  }

  private importFile(path: string, loc: A.Loc, out: A.Stmt[], asType?: string, alias?: string): void {
    const res = this.st.resolve ? this.st.resolve(path.replace(/::/g, "/"), loc.src) : undefined;
    if (!res) {
      // the std library is built in: tolerate `import std.io;` and friends
      if (/^(std|type|hex)\//.test(path) || /^(std|type|hex)$/.test(path)) return;
      throw new PatternError("cannot find import '" + path + "'", loc);
    }
    if (asType !== undefined) {
      const name = this.declareType(asType);
      const program = parseProgram(res.src, res.name, this.st.resolve);
      out.push({ s: "imported", loc, name, ns: this.ns.slice(), program });
      return;
    }
    const key = res.name + "|" + (alias || "");
    if (this.st.seen.has(key)) return;
    // `#pragma once` is shared with #include for plain imports; aliased imports are keyed by alias
    if (!alias && this.st.once.has(res.name)) return;
    this.st.seen.add(key);
    const sub = preprocess(res.src, res.name, this.st.resolve, { defines: this.st.defines, once: alias ? new Set() : this.st.once, pragmas: this.st.pragmas });
    sub.tokens.push({ k: "eof", t: "", line: 0, col: 0, src: res.name });
    const p = new Parser(sub.tokens, this.st, alias);
    p.types = this.types;
    p.ns = alias ? alias.split("::") : [];
    while (p.peek().k !== "eof") p.statement(out);
  }

  expectEnd(): void {
    this.acceptOp(";");
    if (this.peek().k !== "eof") this.err("unexpected trailing input");
  }

  parseAll(): A.Stmt[] {
    const out: A.Stmt[] = [];
    while (this.peek().k !== "eof") {
      if (this.isOp("}")) this.err("unexpected '}'");
      this.statement(out);
    }
    return out;
  }
}

/** Join `A :: B` (scope operator written with spaces) into a single identifier token. */
function mergeScopes(toks: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const prev = out[out.length - 1];
    if (t.k === "op" && t.t === "::" && prev && prev.k === "id" && toks[i + 1] && toks[i + 1].k === "id") {
      out[out.length - 1] = { ...prev, t: prev.t + "::" + toks[i + 1].t };
      i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

/** Reject duplicate member names declared directly in a struct/union/bitfield body. */
function checkMembers(body: A.Stmt[]): void {
  const seen = new Set<string>();
  for (const st of body) {
    const decls = st.s === "decl" ? [st] : st.s === "multi" ? st.decls : [];
    for (const d of decls) {
      if (!d.name) continue;
      if (seen.has(d.name)) throw new PatternError("redefinition of member '" + d.name + "'", d.loc);
      seen.add(d.name);
    }
  }
}

/** Preprocess and parse a pattern source into a Program. */
export function parseProgram(src: string, name = "", resolve?: SourceResolver, defines: string[] = []): A.Program {
  const dm = new Map<string, string>();
  for (const d of defines) dm.set(d, "");
  const once = new Set<string>();
  const pre = { ...preprocess(src, name, resolve, { defines: dm, once, pragmas: [] }), once };
  pre.tokens.push({ k: "eof", t: "", line: 0, col: 0, src: name });
  const st: ImportState = { seen: new Set(), resolve, pragmas: pre.pragmas, defines: dm, once: pre.once };
  const body = new Parser(pre.tokens, st).parseAll();
  return { pragmas: pre.pragmas, body };
}

export function parse(src: string, name = "", resolve?: SourceResolver, defines: string[] = []): A.Program {
  return parseProgram(src, name, resolve, defines);
}

/** Parse a single expression (used to evaluate expressions against a loaded pattern). */
export function parseExpression(src: string, knownTypes: Iterable<string> = []): A.Expr {
  const pre = preprocess(src, "<expr>");
  const st: ImportState = { seen: new Set(), pragmas: pre.pragmas, defines: new Map(), once: new Set() };
  const p = new Parser(pre.tokens, st);
  for (const t of knownTypes) p.types.add(t);
  const e = p.parseExpr();
  p.expectEnd();
  return e;
}
