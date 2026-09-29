import * as A from "./ast";
import { R2Pipe } from "./r2pipe";

export interface Pattern {
  name: string;
  typeName: string;
  offset: number;      // absolute address
  size: number;        // bytes
  value?: any;         // scalar value (numbers/strings)
  children?: Pattern[]; // struct members / array elements
}

const BUILTIN_SIZES: Record<string, number> = {
  u8: 1, i8: 1, char: 1, bool: 1, padding: 1,
  u16: 2, i16: 2, char16: 2, float16: 2,
  u32: 4, i32: 4, char32: 4, float: 4,
  u64: 8, i64: 8, double: 8,
  u128: 16, i128: 16,
};

class Env {
  vars = new Map<string, any>();
  constructor(public parent?: Env) {}
  get(name: string): any {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    return undefined;
  }
  set(name: string, v: any) { this.vars.set(name, v); }
  /** Assign to existing binding in enclosing scope, or declare locally. */
  assignOrDeclare(name: string, v: any) {
    let e: Env | undefined = this;
    while (e) {
      if (e.vars.has(name)) { e.vars.set(name, v); return; }
      e = e.parent;
    }
    this.vars.set(name, v);
  }
}

const MAX_WHILE_ITER = 100000;

export class PatternInstance {
  cursor = 0;
  patterns: Pattern[] = [];                      // top-level patterns in declaration order
  variables = new Map<string, Pattern>();       // top-level lookup by name
  private memberStack: { members: Pattern[]; maxEnd: number }[] = [];
  private typeMap = new Map<string, A.TypeDecl>();
  private enumMap = new Map<string, { name: string; value: number }[]>();

  constructor(private program: A.Program, private r2: R2Pipe) {}

  eval(): void {
    for (const t of this.program.types) this.typeMap.set(t.name, t);
    // populate enum constants (auto-increment unless explicit)
    for (const t of this.program.types) {
      if (t.kind === 'enum') {
        const e = t as A.EnumDecl;
        const env = new Env();
        let next = 0;
        const cases: { name: string; value: number }[] = [];
        for (const c of e.cases) {
          const v = c.value !== undefined ? this.toNum(this.evalExpr(c.value, env)) : next;
          cases.push({ name: c.name, value: v });
          next = v + 1;
        }
        this.enumMap.set(e.name, cases);
      }
    }
    // #pragma endian big|little
    const endian = this.program.pragmas["endian"];
    if (endian && endian.indexOf("big") !== -1) this.r2.bigEndianDefault = true;
    const env = new Env();
    this.topEnv = env;
    for (const stmt of this.program.statements) {
      this.evalStmt(stmt, env);
    }
  }

  // ---- type helpers ----
  private resolveType(name: string): A.TypeDecl | undefined {
    return this.typeMap.get(name);
  }

  private staticSizeOf(type: A.TypeRef, env: Env): number {
    const t = this.typeMap.get(type.name);
    if (!t) return BUILTIN_SIZES[type.name] || 0;
    if (t.kind === 'using') return this.staticSizeOf(t.type, env);
    if (t.kind === 'enum') {
      return t.underlying ? BUILTIN_SIZES[t.underlying.name] || 4 : 4;
    }
    if (t.kind === 'struct' || t.kind === 'union') {
      // compute by walking body placements
      const save = this.cursor;
      const child = new Env(env);
      const p = this.instantiateComposite(t as A.StructDecl, -1, child, undefined, true);
      this.cursor = save;
      return p ? p.size : 0;
    }
    if (t.kind === 'bitfield') return 1; // simplistic
    return 0;
  }

  // ---- statements ----
  private topEnv!: Env;
  private evalStmt(stmt: A.Stmt, env: Env): void {
    switch (stmt.kind) {
      case 'place': {
        const pat = this.evalPlace(stmt, env);
        if (pat) {
          env.set(pat.name, pat);
          const mctx = this.memberStack[this.memberStack.length - 1];
          if (mctx) {
            mctx.members.push(pat);
            const end = pat.offset + pat.size;
            if (end > mctx.maxEnd) mctx.maxEnd = end;
          } else {
            this.patterns.push(pat);
            this.variables.set(pat.name, pat);
          }
        }
        break;
      }
      case 'vardecl': {
        env.assignOrDeclare(stmt.name, this.evalExpr(stmt.value, env));
        break;
      }
      case 'if': {
        if (this.toBool(this.evalExpr(stmt.cond, env))) {
          const child = new Env(env);
          for (const s of stmt.then) this.evalStmt(s, child);
        } else if (stmt.else) {
          const child = new Env(env);
          for (const s of stmt.else) this.evalStmt(s, child);
        }
        break;
      }
      case 'block': {
        const child = new Env(env);
        for (const s of stmt.body) this.evalStmt(s, child);
        break;
      }
      case 'break': throw { __control: 'break' };
      case 'continue': throw { __control: 'continue' };
      case 'return': {
        const val = stmt.value !== undefined ? this.evalExpr(stmt.value, env) : undefined;
        throw { __control: 'return', value: val };
      }
      case 'for': {
        const loopEnv = new Env(env);
        this.evalStmt(stmt.init, loopEnv);
        let iter = 0;
        while (this.toBool(this.evalExpr(stmt.cond, loopEnv))) {
          if (++iter > MAX_WHILE_ITER) throw new Error("for: too many iterations");
          const child = new Env(loopEnv);
          try {
            for (const s of stmt.body) this.evalStmt(s, child);
          } catch (e: any) {
            if (e && e.__control === 'break') break;
            if (e && e.__control === 'continue') { this.evalStmt(stmt.update, loopEnv); continue; }
            throw e;
          }
          this.evalStmt(stmt.update, loopEnv);
        }
        break;
      }
      case 'while': {
        let iter = 0;
        while (this.toBool(this.evalExpr(stmt.cond, env))) {
          if (++iter > MAX_WHILE_ITER) throw new Error("while: too many iterations");
          const child = new Env(env);
          try {
            for (const s of stmt.body) this.evalStmt(s, child);
          } catch (e: any) {
            if (e && e.__control === 'break') break;
            if (e && e.__control === 'continue') continue;
            throw e;
          }
        }
        break;
      }
      default:
        // for/match/callstmt not yet supported at runtime
        break;
    }
  }

  // ---- placement ----
  private evalPlace(stmt: A.Stmt & { kind: 'place' }, env: Env): Pattern | null {
    if (stmt.kind !== 'place') return null;
    const type = stmt.type;
    // explicit placement or cursor
    let addr: number;
    if (stmt.placement) {
      addr = this.toNum(this.evalExpr(stmt.placement, env));
    } else {
      addr = this.cursor;
    }

    const pat: Pattern = {
      name: stmt.name,
      typeName: type.name,
      offset: addr,
      size: 0,
    };

    if (stmt.arraySize !== undefined || (stmt as any).unsized) {
      const n = stmt.arraySize !== undefined ? this.toNum(this.evalExpr(stmt.arraySize, env)) : Infinity;
      pat.children = [];
      const elemSize = this.staticSizeOf(type, env);
      let count = 0;
      const eof = this.r2.fileSize();
      for (;;) {
        if (count >= n) break;
        if ((stmt as any).unsized && addr + count * elemSize + elemSize > eof) break;
        if (count > 100000) throw new Error("array: too many elements");
        const ep = this.instantiateScalarOrComposite(type, addr + count * elemSize, env, pat.name + "[" + count + "]");
        if (ep) { ep.name = pat.name + "[" + count + "]"; pat.children.push(ep); }
        count++;
      }
      pat.size = elemSize * count;
      this.cursor = addr + pat.size;
    } else if (stmt.whileCond) {
      // sentinel array: evaluate until condition false
      pat.children = [];
      let iter = 0;
      const elemSize = this.staticSizeOf(type, env) || 1;
      let a = addr;
      while (this.toBool(this.evalExpr(stmt.whileCond, env))) {
        if (++iter > MAX_WHILE_ITER) throw new Error("array while: too many iterations");
        const ep = this.instantiateScalarOrComposite(type, a, env, stmt.name + "[" + (iter - 1) + "]");
        if (ep) pat.children.push(ep);
        a += elemSize;
      }
      pat.size = a - addr;
      this.cursor = a;
    } else {
      const p = this.instantiateScalarOrComposite(type, addr, env, stmt.name);
      pat.value = p ? p.value : undefined;
      pat.children = p ? p.children : undefined;
      pat.size = p ? p.size : 0;
      this.cursor = addr + pat.size;
    }
    return pat;
  }

  /** Instantiate one element of the given type at addr (scalar read or composite). */
  private instantiateScalarOrComposite(type: A.TypeRef, addr: number, env: Env, name: string): Pattern | null {
    const decl = this.typeMap.get(type.name);
    if (decl && (decl.kind === 'struct' || decl.kind === 'union')) {
      const child = new Env(env);
      return this.instantiateComposite(decl as A.StructDecl, addr, child, name);
    }
    // scalar
    const be = type.endian === 'be' ? true : type.endian === 'le' ? false : undefined;
    let size = this.staticSizeOf(type, env);
    let value: any;
    if (type.name === 'str' || type.name === 'strz') {
      value = this.r2.readStringZ(addr);
      size = value.length + (type.name === 'strz' ? 1 : 0);
    } else if (type.name === 'float' || type.name === 'double' || type.name === 'float16') {
      value = this.r2.readFloat(addr, size, be);
    } else if (type.name === 'char') {
      value = this.r2.readUnsigned(addr, 1, be);
    } else if (type.name === 'bool') {
      value = this.r2.readUnsigned(addr, 1, be) !== 0;
    } else if (type.name === 'padding') {
      value = 0;
    } else {
      const signed = /^i(8|16|32|64|128)$/.test(type.name);
      value = signed ? this.r2.readSigned(addr, size, be) : this.r2.readUnsigned(addr, size, be);
      // enum value → resolve name
      const ed = this.typeMap.get(type.name);
      if (ed && ed.kind === 'enum') value = value;
    }
    return { name, typeName: type.name, offset: addr, size, value };
  }

  /** Instantiate struct/union at base addr, evaluating its body. */
  private instantiateComposite(decl: A.StructDecl | A.UnionDecl, base: number, env: Env, name?: string, dryRun = false): Pattern {
    const pat: Pattern = { name: name ?? decl.name, typeName: decl.name, offset: base, size: 0 };
    const members: Pattern[] = [];
    const isUnion = decl.kind === 'union';
    const saveCursor = this.cursor;
    this.cursor = base;
    const mctx = { members, maxEnd: base };
    this.memberStack.push(mctx);
    try {
      for (const s of decl.body) {
        if (s.kind !== 'place') {
          if (!dryRun) this.evalStmt(s, env);
          continue;
        }
        const mp = this.evalPlace(s, env);
        if (mp) {
          env.set(mp.name, mp);
          const end = mp.offset + mp.size;
          if (end > mctx.maxEnd) mctx.maxEnd = end;
          if (!dryRun) {
            members.push(mp);
          }
        }
      }
      pat.children = members;
      pat.size = Math.max(mctx.maxEnd - base, 0);
      if (isUnion) this.cursor = saveCursor; // union doesn't advance outer cursor by itself
    } finally {
      this.memberStack.pop();
      const consumed = pat.size;
      this.cursor = dryRun ? saveCursor : base + consumed;
    }
    return pat;
  }

  // ---- expressions ----
  private toBool(v: any): boolean {
    if (v === undefined || v === null) return false;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'boolean') return v;
    return true;
  }
  private toNum(v: any): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v && typeof v === 'object' && 'value' in v) return this.toNum(v.value);
    return Number(v);
  }

  evalExpr(expr: A.Expr, env: Env): any {
    switch (expr.kind) {
      case 'num': return expr.value;
      case 'str': return expr.value;
      case 'bool': return expr.value;
      case 'char': return expr.value;
      case 'null': return null;
      case 'ident': {
        const v = env.get(expr.name);
        if (v === undefined) {
          // enum constant? EnumName::CONST
          const parts = expr.name.split("::");
          if (parts.length === 2) {
            const cases = this.enumMap.get(parts[0]);
            if (cases) for (const c of cases) if (c.name === parts[1]) return c.value;
          }
          return undefined;
        }
        return v;
      }
      case 'member': {
        const obj = this.evalExpr(expr.obj, env);
        if (obj && typeof obj === 'object' && obj.children) {
          for (const c of obj.children) if (c.name === expr.name) return c;
        }
        return undefined;
      }
      case 'index': {
        const obj = this.evalExpr(expr.obj, env);
        const idx = this.toNum(this.evalExpr(expr.idx, env));
        if (obj && typeof obj === 'object' && obj.children) {
          if (obj.children[idx]) return obj.children[idx];
          // named elements name[i]
          for (const c of obj.children) if (c.name === obj.name + "[" + idx + "]") return c;
        }
        return undefined;
      }
      case 'binary': {
        const l = this.evalExpr(expr.lhs, env);
        const r = this.evalExpr(expr.rhs, env);
        const ln = this.toNum(l), rn = this.toNum(r);
        switch (expr.op) {
          case '+': return ln + rn;
          case '-': return ln - rn;
          case '*': return ln * rn;
          case '/': return rn === 0 ? 0 : Math.floor(ln / rn);
          case '%': return rn === 0 ? 0 : ln % rn;
          case '&': return ln & rn;
          case '|': return ln | rn;
          case '^': return ln ^ rn;
          case '<<': return ln << rn;
          case '>>': return ln >>> rn;
          case '==': return ln === rn;
          case '!=': return ln !== rn;
          case '<': return ln < rn;
          case '<=': return ln <= rn;
          case '>': return ln > rn;
          case '>=': return ln >= rn;
          case '&&': return this.toBool(l) && this.toBool(r);
          case '||': return this.toBool(l) || this.toBool(r);
          case '^^': return this.toBool(l) !== this.toBool(r);
        }
        return undefined;
      }
      case 'unary': {
        const v = this.evalExpr(expr.operand, env);
        if (expr.op === '-') return -this.toNum(v);
        if (expr.op === '!') return !this.toBool(v);
        if (expr.op === '~') return ~this.toNum(v);
        return v;
      }
      case 'ternary':
        return this.toBool(this.evalExpr(expr.cond, env))
          ? this.evalExpr(expr.a, env) : this.evalExpr(expr.b, env);
      case 'sizeof': {
        if (expr.operand.kind === 'ident') {
          const v = env.get(expr.operand.name);
          if (v && typeof v === 'object' && 'size' in v) return v.size;
          return this.staticSizeOf({ name: expr.operand.name }, env);
        }
        const v = this.evalExpr(expr.operand, env);
        return v && typeof v === 'object' && 'size' in v ? v.size : 0;
      }
      case 'addressof': {
        const v = this.evalExpr(expr.operand, env);
        return v && typeof v === 'object' && 'offset' in v ? v.offset : undefined;
      }
      case 'this': return env.get('this');
      case 'parent': return env.parent ? env.parent : undefined;
      case 'call': {
        const fd = this.typeMap.get(expr.name);
        if (fd && (fd as any).kind === 'fn') {
          const fn = fd as any;
          const fenv = new Env(env);
          fn.params.forEach((p: { name: string }, i: number) => {
            fenv.set(p.name, i < expr.args.length ? this.evalExpr(expr.args[i], env) : undefined);
          });
          try {
            for (const s of fn.body) this.evalStmt(s, fenv);
          } catch (e: any) {
            if (e && e.__control === 'return') return e.value;
            throw e;
          }
          return undefined;
        }
        // std builtins
        if (expr.name === "std::print" || expr.name === "print") {
          const args = expr.args.map((a: A.Expr) => this.evalExpr(a, env));
          console.log(args.map((v: any) => (typeof v === 'string' ? v : String(v))).join(" "));
          return undefined;
        }
        return undefined;
      }
      default: return undefined;
    }
  }

  // ---- dump ----
  dump(): void {
    for (const p of this.patterns) this.dumpPattern(p, 0);
  }
  private dumpPattern(p: Pattern, indent: number): void {
    const pad = "".padStart(indent * 2, " ");
    const addr = "0x" + p.offset.toString(16).padStart(8, "0");
    let line = pad + p.name + " (" + p.typeName + ") @ " + addr;
    if (p.children && p.children.length) {
      line += " size=" + p.size;
      console.log(line);
      for (const c of p.children) this.dumpPattern(c, indent + 1);
    } else {
      let v = p.value;
      if (typeof v === 'bigint') {
        line += " = " + v + " (0x" + v.toString(16) + ")";
      } else if (typeof v === 'number') {
        const isFloat = p.typeName === 'float' || p.typeName === 'double' || p.typeName === 'float16';
        if (!isFloat && Number.isInteger(v)) {
          const ecases = this.enumMap.get(p.typeName);
          const ec = ecases && ecases.find((c) => c.value === v);
          line += " = " + v + " (" + (v < 0 ? "-0x" + (-v).toString(16) : "0x" + v.toString(16)) + ")" + (ec ? " = " + p.typeName + "::" + ec.name : "");
        }
        else line += " = " + v;
      } else if (typeof v === 'string') {
        line += ' = "' + v.replace(/[\x00-\x1f\x7f-\xff\\"]/g, (c) => {
          const esc = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\\': '\\\\', '"': '\\"' } as Record<string, string>;
          if (esc[c]) return esc[c];
          return '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0');
        }) + '"';
      } else if (typeof v === 'boolean') {
        line += " = " + v;
      } else {
        line += " size=" + p.size;
      }
      console.log(line);
    }
  }

  get(name: string): Pattern | undefined { return this.variables.get(name); }
}
