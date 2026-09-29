import { Tok, Token, lex } from "./lexer";
import * as A from "./ast";

export class ParseError extends Error {
  constructor(msg: string, tok: Token) {
    super(`${msg} @ line ${tok.line} near '${tok.text}'`);
  }
}

const PRECEDENCE: string[][] = [
  ["||"], ["&&"], ["^^"], ["==", "!="], ["<", "<=", ">", ">="],
  ["|"], ["^"], ["&"], ["<<", ">>"], ["+", "-"], ["*", "/", "%"],
];

class Parser {
  toks: Token[]; i = 0; pragmas: Record<string, string> = {};
  constructor(toks: Token[]) { this.toks = toks; }
  peek(n = 0): Token { return this.toks[this.i + n] || this.toks[this.toks.length - 1]; }
  next(): Token { return this.toks[this.i++]; }
  accept(t: Tok): Token | null { return this.peek().tok === t ? this.next() : null; }
  expect(t: Tok): Token {
    const tok = this.next();
    if (tok.tok !== t) throw new ParseError(`Expected ${Tok[t]}, got ${Tok[tok.tok]}`, tok);
    return tok;
  }
  acceptKeyword(w: string): boolean {
    const p = this.peek();
    if (p.tok === Tok.KEYWORD && p.text === w) { this.i++; return true; }
    return false;
  }

  parseTypeRef(): A.TypeRef {
    const t: A.TypeRef = { name: "" };
    if (this.acceptKeyword("be")) t.endian = "be";
    else if (this.acceptKeyword("le")) t.endian = "le";
    if (this.acceptKeyword("const")) t.const = true;
    t.name = this.expect(Tok.IDENT).text;
    while (this.peek().tok === Tok.STAR) { this.next(); t.pointerDepth = (t.pointerDepth ?? 0) + 1; }
    if (this.peek().tok === Tok.LT) {
      this.next();
      const args: any[] = [];
      while (this.peek().tok !== Tok.GT && this.peek().tok !== Tok.EOF) {
        args.push(this.parseExpr());
        if (this.accept(Tok.COMMA)) continue;
        break;
      }
      this.expect(Tok.GT);
      t.templateArgs = args;
    }
    return t;
  }

  parseAttributes(): A.Attribute[] | undefined {
    if (!this.accept(Tok.ATTR_OPEN)) return undefined;
    const attrs: A.Attribute[] = [];
    while (!this.accept(Tok.ATTR_CLOSE)) {
      const name = this.expect(Tok.IDENT).text;
      const args: (string | number)[] = [];
      if (this.accept(Tok.LPAREN)) {
        while (!this.accept(Tok.RPAREN)) {
          const t = this.next();
          if (t.tok === Tok.STRING) args.push(t.text);
          else if (t.tok === Tok.NUMBER) args.push(t.num!);
          else if (t.tok === Tok.IDENT) args.push(t.text);
          if (!this.accept(Tok.COMMA)) { this.accept(Tok.RPAREN); break; }
        }
      }
      attrs.push({ name, args });
      if (!this.accept(Tok.COMMA)) { this.expect(Tok.ATTR_CLOSE); break; }
    }
    return attrs.length ? attrs : undefined;
  }

  parseExpr(): A.Expr { return this.parseTernary(); }
  parseTernary(): A.Expr {
    const cond = this.parseBinary(0);
    if (this.accept(Tok.QUESTION)) {
      const a = this.parseTernary();
      this.expect(Tok.COLON);
      const b = this.parseTernary();
      return { kind: 'ternary', cond, a, b };
    }
    return cond;
  }
  parseBinary(level: number): A.Expr {
    if (level >= PRECEDENCE.length) return this.parseUnary();
    let lhs = this.parseBinary(level + 1);
    while (PRECEDENCE[level].includes(this.peek().text)) {
      const op = this.next().text;
      const rhs = this.parseBinary(level + 1);
      lhs = { kind: 'binary', op, lhs, rhs };
    }
    return lhs;
  }
  parseUnary(): A.Expr {
    const t = this.peek();
    if (t.tok === Tok.MINUS) { this.next(); return { kind: 'unary', op: '-', operand: this.parseUnary() }; }
    if (t.tok === Tok.NOT) { this.next(); return { kind: 'unary', op: '!', operand: this.parseUnary() }; }
    if (t.tok === Tok.TILDE) { this.next(); return { kind: 'unary', op: '~', operand: this.parseUnary() }; }
    return this.parsePostfix();
  }
  parsePostfix(): A.Expr {
    let e = this.parsePrimary();
    while (true) {
      if (this.peek().tok === Tok.DOT) {
        this.next();
        e = { kind: 'member', obj: e, name: this.expect(Tok.IDENT).text };
      } else if (this.peek().tok === Tok.LBRACKET) {
        this.next();
        const idx = this.parseExpr();
        this.expect(Tok.RBRACKET);
        e = { kind: 'index', obj: e, idx };
      } else break;
    }
    return e;
  }
  parsePrimary(): A.Expr {
    const t = this.next();
    switch (t.tok) {
      case Tok.NUMBER: return { kind: 'num', value: t.num! };
      case Tok.STRING: return { kind: 'str', value: t.text };
      case Tok.CHAR: return { kind: 'char', value: t.text };
      case Tok.LPAREN: {
        const e = this.parseExpr();
        this.expect(Tok.RPAREN);
        return e;
      }
      case Tok.IDENT:
        if (this.peek().tok === Tok.LPAREN) {
          this.next();
          const args: A.Expr[] = [];
          if (!this.accept(Tok.RPAREN)) {
            while (true) {
              args.push(this.parseExpr());
              if (this.accept(Tok.COMMA)) continue;
              this.expect(Tok.RPAREN);
              break;
            }
          }
          return { kind: 'call', name: t.text, args };
        }
        return { kind: 'ident', name: t.text };
      case Tok.KEYWORD:
        if (t.text === "true") return { kind: 'bool', value: true };
        if (t.text === "false") return { kind: 'bool', value: false };
        if (t.text === "null") return { kind: 'null' };
        if (t.text === "this") return { kind: 'this' };
        if (t.text === "parent") return { kind: 'parent' };
        if (t.text === "sizeof" || t.text === "addressof" || t.text === "typenameof") {
          const operand = this.parsePostfix();
          return { kind: t.text as any, operand };
        }
        throw new ParseError(`Unexpected keyword '${t.text}' in expression`, t);
      default:
        throw new ParseError(`Unexpected token '${t.text}' in expression`, t);
    }
  }

  parseStmt(): A.Stmt {
    const p = this.peek();
    if (p.tok === Tok.KEYWORD) {
      switch (p.text) {
        case 'if': {
          this.next();
          this.expect(Tok.LPAREN);
          const cond = this.parseExpr();
          this.expect(Tok.RPAREN);
          const then = this.parseBlockOrSingle();
          let els: A.Stmt[] | undefined;
          if (this.acceptKeyword("else")) els = this.parseBlockOrSingle();
          return { kind: 'if', cond, then, else: els };
        }
        case 'while': {
          this.next();
          this.expect(Tok.LPAREN);
          const cond = this.parseExpr();
          this.expect(Tok.RPAREN);
          const body = this.parseBlockOrSingle();
          return { kind: 'while', cond, body };
        }
        case 'for': {
          this.next();
          this.expect(Tok.LPAREN);
          // init: either "Type i = expr" (vardecl) or "i = expr" (assign)
          let init: A.Stmt | undefined;
          if (this.peek().tok === Tok.IDENT && this.peek(1).tok === Tok.ASSIGN) {
            init = this.parseStmt();
          } else {
            const type = this.parseTypeRef();
            const name = this.expect(Tok.IDENT).text;
            this.expect(Tok.ASSIGN);
            const value = this.parseExpr();
            this.expect(Tok.SEMI);
            init = { kind: 'vardecl', name, value };
          }
          const cond = this.parseExpr();
          this.expect(Tok.SEMI);
          // update: "i = expr" assignment expression-statement
          const uname = this.expect(Tok.IDENT).text;
          this.expect(Tok.ASSIGN);
          const uvalue = this.parseExpr();
          const update: A.Stmt = { kind: 'vardecl', name: uname, value: uvalue };
          this.expect(Tok.RPAREN);
          const body = this.parseBlockOrSingle();
          return { kind: 'for', init, cond, update, body };
        }
        case 'break': this.next(); this.accept(Tok.SEMI); return { kind: 'break' };
        case 'continue': this.next(); this.accept(Tok.SEMI); return { kind: 'continue' };
        case 'return': {
          this.next();
          if (this.accept(Tok.SEMI)) return { kind: 'return', value: undefined };
          const value = this.parseExpr();
          this.accept(Tok.SEMI);
          return { kind: 'return', value };
        }
      }
    }
    // pattern-local variable assignment: name = expr;
    if (p.tok === Tok.IDENT && this.peek(1).tok === Tok.ASSIGN) {
      const name = this.next().text;
      this.next(); // =
      const value = this.parseExpr();
      this.accept(Tok.SEMI);
      return { kind: 'vardecl', name, value };
    }
    // placement: Type [[attrs]] name[N] : ptrbase [@ expr];
    const type = this.parseTypeRef();
    const attributes = this.parseAttributes();
    const name = this.expect(Tok.IDENT).text;
    // Type name = expr; → local variable with initializer (not a placement)
    if (this.peek().tok === Tok.ASSIGN) {
      this.next(); // =
      const value = this.parseExpr();
      this.accept(Tok.SEMI);
      return { kind: 'vardecl', name, value };
    }
    let arraySize: A.Expr | undefined;
    let whileCond: A.Expr | undefined;
    let unsized = false;
    if (this.accept(Tok.LBRACKET)) {
      if (this.acceptKeyword("while")) {
        this.expect(Tok.LPAREN);
        whileCond = this.parseExpr();
        this.expect(Tok.RPAREN);
      } else if (this.peek().tok === Tok.RBRACKET) {
        unsized = true;
      } else {
        arraySize = this.parseExpr();
      }
      this.expect(Tok.RBRACKET);
    }
    if (type.pointerDepth && this.accept(Tok.COLON)) {
      type.pointerBase = this.parseTypeRef();
    }
    let placement: A.Expr | undefined;
    if (this.accept(Tok.ATTRIB)) {
      placement = this.parseExpr();
    }
    this.accept(Tok.SEMI);
    return { kind: 'place', type, name, attributes, placement, arraySize, whileCond, unsized } as any;
  }

  parseBlockOrSingle(): A.Stmt[] {
    if (this.accept(Tok.LBRACE)) {
      const body: A.Stmt[] = [];
      while (this.peek().tok !== Tok.RBRACE && this.peek().tok !== Tok.EOF) {
        body.push(this.parseStmt());
      }
      this.expect(Tok.RBRACE);
      return body;
    }
    return [this.parseStmt()];
  }

  parseStructBody(): A.Stmt[] {
    this.expect(Tok.LBRACE);
    const body: A.Stmt[] = [];
    while (this.peek().tok !== Tok.RBRACE && this.peek().tok !== Tok.EOF) {
      body.push(this.parseStmt());
    }
    this.expect(Tok.RBRACE);
    return body;
  }

  // Parse ONE item: pragma, type declaration, or placement statement.
  // Returns false if the next token is RBRACE (end of enclosing block).
  parseDeclOrStmt(types: A.TypeDecl[], statements: A.Stmt[]): boolean {
    const p = this.peek();
    if (p.tok === Tok.EOF || p.tok === Tok.RBRACE) return false;

    // pragmas arrive as ATTRIB("pragma") + STRING("endian big;") etc
    if (p.tok === Tok.ATTRIB) {
      this.next();
      const v = this.next();
      const full = v.text.trim();
      const key = full.split(/[ \t;]/)[0];
      this.pragmas[key] = full;
      return true;
    }
    if (p.tok === Tok.KEYWORD && p.text === "import") {
      this.next();
      this.expect(Tok.STRING);
      this.accept(Tok.SEMI);
      return true;
    }

    if (p.tok === Tok.KEYWORD) {
      switch (p.text) {
        case 'struct': {
          this.next();
          const name = this.expect(Tok.IDENT).text;
          const body = this.parseStructBody();
          const attributes = this.parseAttributes();
          this.accept(Tok.SEMI);
          types.push({ kind: 'struct', name, body, attributes });
          return true;
        }
        case 'union': {
          this.next();
          const name = this.expect(Tok.IDENT).text;
          const body = this.parseStructBody();
          const attributes = this.parseAttributes();
          this.accept(Tok.SEMI);
          types.push({ kind: 'union', name, body, attributes });
          return true;
        }
        case 'enum': {
          this.next();
          const name = this.expect(Tok.IDENT).text;
          let underlying: A.TypeRef | undefined;
          if (this.accept(Tok.COLON)) underlying = this.parseTypeRef();
          this.expect(Tok.LBRACE);
          const cases: { name: string; value?: A.Expr }[] = [];
          while (this.peek().tok !== Tok.RBRACE && this.peek().tok !== Tok.EOF) {
            const cn = this.expect(Tok.IDENT).text;
            let value: A.Expr | undefined;
            if (this.accept(Tok.ASSIGN)) value = this.parseExpr();
            cases.push({ name: cn, value });
            if (!this.accept(Tok.COMMA)) break;
          }
          this.expect(Tok.RBRACE);
          this.accept(Tok.SEMI);
          types.push({ kind: 'enum', name, underlying, cases });
          return true;
        }
        case 'bitfield': {
          this.next();
          const name = this.expect(Tok.IDENT).text;
          this.expect(Tok.LBRACE);
          const fields: { name: string; size: A.Expr }[] = [];
          while (this.peek().tok !== Tok.RBRACE && this.peek().tok !== Tok.EOF) {
            const fname = this.expect(Tok.IDENT).text;
            this.expect(Tok.COLON);
            const size = this.parseExpr();
            fields.push({ name: fname, size });
            if (!this.accept(Tok.COMMA)) this.accept(Tok.SEMI);
          }
          this.expect(Tok.RBRACE);
          this.expect(Tok.SEMI);
          types.push({ kind: 'bitfield', name, fields });
          return true;
        }
        case 'using': {
          this.next();
          const name = this.expect(Tok.IDENT).text;
          if (this.peek().tok === Tok.SEMI) { this.next(); return true; }
          this.expect(Tok.ASSIGN);
          const type = this.parseTypeRef();
          this.accept(Tok.SEMI);
          types.push({ kind: 'using', name, type });
          return true;
        }
        case 'fn': {
          this.next();
          const name = this.expect(Tok.IDENT).text;
          this.expect(Tok.LPAREN);
          const params: { name: string }[] = [];
          if (!this.accept(Tok.RPAREN)) {
            while (true) {
              this.acceptKeyword("auto"); this.acceptKeyword("ref"); this.acceptKeyword("out");
              // "Type name" or bare "name"
              let pname = this.peek().text;
              if (this.peek().tok === Tok.IDENT && this.peek(1).tok === Tok.IDENT) {
                this.next(); // type
                pname = this.expect(Tok.IDENT).text;
              } else if (this.peek().tok === Tok.IDENT) {
                pname = this.next().text;
              } else {
                this.expect(Tok.IDENT);
              }
              params.push({ name: pname });
              if (this.accept(Tok.COMMA)) continue;
              this.expect(Tok.RPAREN);
              break;
            }
          }
          let ret: A.TypeRef | undefined;
          if (this.accept(Tok.ARROW)) ret = this.parseTypeRef();
          const body = this.parseBlockOrSingle();
          types.push({ kind: 'fn', name, params, ret, body } as any);
          return true;
        }
        case 'namespace': {
          this.next();
          const ns = this.expect(Tok.IDENT).text;
          this.expect(Tok.LBRACE);
          const nBefore = types.length;
          while (this.parseDeclOrStmt(types, statements)) { /* keep going */ }
          this.expect(Tok.RBRACE);
          for (let k = nBefore; k < types.length; k++) {
            types[k].name = ns + "::" + types[k].name;
          }
          return true;
        }
      }
    }
    statements.push(this.parseStmt());
    return true;
  }

  parseProgram(): A.Program {
    const types: A.TypeDecl[] = [];
    const statements: A.Stmt[] = [];
    while (this.parseDeclOrStmt(types, statements)) { /* keep going */ }
    return { pragmas: this.pragmas, types, statements };
  }
}

export function parse(src: string): A.Program {
  return new Parser(lex(src)).parseProgram();
}
