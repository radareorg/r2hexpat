"use strict";
(() => {
  // lexer.ts
  var Tok;
  (function(Tok2) {
    Tok2[Tok2["EOF"] = 0] = "EOF";
    Tok2[Tok2["IDENT"] = 1] = "IDENT";
    Tok2[Tok2["KEYWORD"] = 2] = "KEYWORD";
    Tok2[Tok2["NUMBER"] = 3] = "NUMBER";
    Tok2[Tok2["STRING"] = 4] = "STRING";
    Tok2[Tok2["CHAR"] = 5] = "CHAR";
    Tok2[Tok2["ATTR_OPEN"] = 6] = "ATTR_OPEN";
    Tok2[Tok2["ATTR_CLOSE"] = 7] = "ATTR_CLOSE";
    Tok2[Tok2["COMMA"] = 8] = "COMMA";
    Tok2[Tok2["SEMI"] = 9] = "SEMI";
    Tok2[Tok2["COLON"] = 10] = "COLON";
    Tok2[Tok2["ATTRIB"] = 11] = "ATTRIB";
    Tok2[Tok2["LPAREN"] = 12] = "LPAREN";
    Tok2[Tok2["RPAREN"] = 13] = "RPAREN";
    Tok2[Tok2["LBRACE"] = 14] = "LBRACE";
    Tok2[Tok2["RBRACE"] = 15] = "RBRACE";
    Tok2[Tok2["LBRACKET"] = 16] = "LBRACKET";
    Tok2[Tok2["RBRACKET"] = 17] = "RBRACKET";
    Tok2[Tok2["PLUS"] = 18] = "PLUS";
    Tok2[Tok2["MINUS"] = 19] = "MINUS";
    Tok2[Tok2["STAR"] = 20] = "STAR";
    Tok2[Tok2["SLASH"] = 21] = "SLASH";
    Tok2[Tok2["PERCENT"] = 22] = "PERCENT";
    Tok2[Tok2["SHL"] = 23] = "SHL";
    Tok2[Tok2["SHR"] = 24] = "SHR";
    Tok2[Tok2["AND"] = 25] = "AND";
    Tok2[Tok2["OR"] = 26] = "OR";
    Tok2[Tok2["XOR"] = 27] = "XOR";
    Tok2[Tok2["NOT"] = 28] = "NOT";
    Tok2[Tok2["TILDE"] = 29] = "TILDE";
    Tok2[Tok2["EQ"] = 30] = "EQ";
    Tok2[Tok2["NE"] = 31] = "NE";
    Tok2[Tok2["LT"] = 32] = "LT";
    Tok2[Tok2["GT"] = 33] = "GT";
    Tok2[Tok2["LE"] = 34] = "LE";
    Tok2[Tok2["GE"] = 35] = "GE";
    Tok2[Tok2["ANDAND"] = 36] = "ANDAND";
    Tok2[Tok2["OROR"] = 37] = "OROR";
    Tok2[Tok2["XORXOR"] = 38] = "XORXOR";
    Tok2[Tok2["NOTNOT"] = 39] = "NOTNOT";
    Tok2[Tok2["QUESTION"] = 40] = "QUESTION";
    Tok2[Tok2["ARROW"] = 41] = "ARROW";
    Tok2[Tok2["DOTDOT"] = 42] = "DOTDOT";
    Tok2[Tok2["SCOPE"] = 43] = "SCOPE";
    Tok2[Tok2["DOT"] = 44] = "DOT";
    Tok2[Tok2["ASSIGN"] = 45] = "ASSIGN";
  })(Tok || (Tok = {}));
  var KEYWORDS = /* @__PURE__ */ new Set(["struct", "union", "enum", "bitfield", "using", "namespace", "import", "fn", "if", "else", "while", "for", "match", "break", "continue", "return", "be", "le", "const", "unsigned", "signed", "this", "parent", "true", "false", "null", "sizeof", "addressof", "typenameof", "auto", "ref", "out"]);
  function lex(src2) {
    const tokens = [];
    let i = 0, line = 1, pos = 0;
    const peek = (n = 0) => src2[i + n];
    const push = (tok, text, num) => tokens.push({ tok, text, num, line, pos });
    while (i < src2.length) {
      const c = src2[i];
      if (c === "\n") {
        line++;
        pos = 0;
        i++;
        continue;
      }
      if (c === " " || c === "	" || c === "\r") {
        i++;
        pos++;
        continue;
      }
      if (c === "/" && peek(1) === "/") {
        while (i < src2.length && src2[i] !== "\n")
          i++;
        continue;
      }
      if (c === "/" && peek(1) === "*") {
        i += 2;
        while (i < src2.length && !(src2[i] === "*" && src2[i + 1] === "/")) {
          if (src2[i] === "\n") {
            line++;
            pos = 0;
          }
          i++;
        }
        i += 2;
        continue;
      }
      if (c === "#") {
        let j = i + 1;
        while (j < src2.length && /[ \t]/.test(src2[j]))
          j++;
        let word = "";
        while (j < src2.length && /[a-zA-Z_]/.test(src2[j])) {
          word += src2[j];
          j++;
        }
        let rest = "";
        while (j < src2.length && src2[j] !== "\n") {
          rest += src2[j];
          j++;
        }
        push(Tok.ATTRIB, word);
        push(Tok.STRING, rest.trim());
        i = j;
        continue;
      }
      if (c === "[" && peek(1) === "[") {
        push(Tok.ATTR_OPEN, "[[");
        i += 2;
        pos += 2;
        while (i < src2.length) {
          if (src2[i] === "]" && src2[i + 1] === "]") {
            push(Tok.ATTR_CLOSE, "]]");
            i += 2;
            break;
          }
          if (src2[i] === ",") {
            push(Tok.COMMA, ",");
            i++;
            continue;
          }
          if (src2[i] === '"') {
            i++;
            let s2 = "";
            while (i < src2.length && src2[i] !== '"') {
              if (src2[i] === "\\") {
                s2 += src2[i + 1];
                i += 2;
              } else
                s2 += src2[i++];
            }
            i++;
            push(Tok.STRING, s2);
            continue;
          }
          if (/\s/.test(src2[i])) {
            if (src2[i] === "\n") {
              line++;
              pos = 0;
            }
            i++;
            continue;
          }
          let s = "";
          while (i < src2.length && /[\w.\-]/.test(src2[i]) && !(src2[i] === "]" && src2[i + 1] === "]")) {
            s += src2[i];
            i++;
          }
          if (s.length === 0) {
            s = src2[i];
            i++;
          }
          push(Tok.IDENT, s);
        }
        continue;
      }
      if (/[0-9]/.test(c)) {
        let s = "";
        if (c === "0" && (peek(1) === "x" || peek(1) === "X")) {
          s = "0x";
          i += 2;
          while (i < src2.length && /[0-9a-fA-F_]/.test(src2[i]))
            s += src2[i++];
          push(Tok.NUMBER, s, parseInt(s.replace(/_/g, ""), 16));
        } else if (c === "0" && (peek(1) === "b" || peek(1) === "B")) {
          s = "0b";
          i += 2;
          while (i < src2.length && /[01_]/.test(src2[i]))
            s += src2[i++];
          push(Tok.NUMBER, s, parseInt(s.slice(2).replace(/_/g, ""), 2));
        } else {
          while (i < src2.length && /[0-9_]/.test(src2[i]))
            s += src2[i++];
          if (src2[i] === "." && /[0-9]/.test(src2[i + 1] || "")) {
            s += ".";
            i++;
            while (i < src2.length && /[0-9]/.test(src2[i]))
              s += src2[i++];
            push(Tok.NUMBER, s, parseFloat(s));
          } else
            push(Tok.NUMBER, s, parseInt(s.replace(/_/g, ""), 10));
        }
        pos += s.length;
        continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        let s = "";
        while (i < src2.length && /[a-zA-Z0-9_]/.test(src2[i])) {
          s += src2[i];
          i++;
          pos++;
        }
        while (i + 1 < src2.length && src2[i] === ":" && src2[i + 1] === ":") {
          s += "::";
          i += 2;
          pos += 2;
          while (i < src2.length && /[a-zA-Z0-9_]/.test(src2[i])) {
            s += src2[i];
            i++;
            pos++;
          }
        }
        if (KEYWORDS.has(s))
          push(Tok.KEYWORD, s);
        else
          push(Tok.IDENT, s);
        continue;
      }
      if (c === '"') {
        i++;
        let s = "";
        while (i < src2.length && src2[i] !== '"') {
          if (src2[i] === "\\") {
            const e = src2[i + 1];
            s += e === "n" ? "\n" : e === "t" ? "	" : e;
            i += 2;
          } else
            s += src2[i++];
        }
        i++;
        pos += s.length + 2;
        push(Tok.STRING, s);
        continue;
      }
      if (c === "'") {
        i++;
        let ch = src2[i];
        if (ch === "\\") {
          ch = src2[i + 1];
          i += 2;
        } else
          i++;
        i++;
        pos += 3;
        push(Tok.CHAR, ch, ch.charCodeAt(0));
        continue;
      }
      if (src2.substr(i, 3) === "...") {
        push(Tok.DOTDOT, "...");
        i += 3;
        pos += 3;
        continue;
      }
      const two = src2.substr(i, 2);
      if (two === "::") {
        push(Tok.SCOPE, "::");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "==") {
        push(Tok.EQ, "==");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "!=") {
        push(Tok.NE, "!=");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "<=") {
        push(Tok.LE, "<=");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === ">=") {
        push(Tok.GE, ">=");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "<<") {
        push(Tok.SHL, "<<");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === ">>") {
        push(Tok.SHR, ">>");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "&&") {
        push(Tok.ANDAND, "&&");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "||") {
        push(Tok.OROR, "||");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "^^") {
        push(Tok.XORXOR, "^^");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "!!") {
        push(Tok.NOTNOT, "!!");
        i += 2;
        pos += 2;
        continue;
      }
      if (two === "->") {
        push(Tok.ARROW, "->");
        i += 2;
        pos += 2;
        continue;
      }
      switch (c) {
        case "+":
          push(Tok.PLUS, "+");
          break;
        case "-":
          push(Tok.MINUS, "-");
          break;
        case "*":
          push(Tok.STAR, "*");
          break;
        case "/":
          push(Tok.SLASH, "/");
          break;
        case "%":
          push(Tok.PERCENT, "%");
          break;
        case "&":
          push(Tok.AND, "&");
          break;
        case "|":
          push(Tok.OR, "|");
          break;
        case "^":
          push(Tok.XOR, "^");
          break;
        case "=":
          push(Tok.ASSIGN, "=");
          break;
        case "~":
          push(Tok.TILDE, "~");
          break;
        case "!":
          push(Tok.NOT, "!");
          break;
        case "?":
          push(Tok.QUESTION, "?");
          break;
        case ",":
          push(Tok.COMMA, ",");
          break;
        case ";":
          push(Tok.SEMI, ";");
          break;
        case ":":
          push(Tok.COLON, ":");
          break;
        case "@":
          push(Tok.ATTRIB, "@");
          break;
        case ".":
          push(Tok.DOT, ".");
          break;
        case "(":
          push(Tok.LPAREN, "(");
          break;
        case ")":
          push(Tok.RPAREN, ")");
          break;
        case "{":
          push(Tok.LBRACE, "{");
          break;
        case "}":
          push(Tok.RBRACE, "}");
          break;
        case "[":
          push(Tok.LBRACKET, "[");
          break;
        case "]":
          push(Tok.RBRACKET, "]");
          break;
        case "<":
          push(Tok.LT, "<");
          break;
        case ">":
          push(Tok.GT, ">");
          break;
        default:
          throw new Error(`Unexpected character '${c}' at line ${line}`);
      }
      i++;
      pos++;
    }
    push(Tok.EOF, "");
    return tokens;
  }

  // parser.ts
  var ParseError = class extends Error {
    constructor(msg, tok) {
      super(`${msg} @ line ${tok.line} near '${tok.text}'`);
    }
  };
  var PRECEDENCE = [
    ["||"],
    ["&&"],
    ["^^"],
    ["==", "!="],
    ["<", "<=", ">", ">="],
    ["|"],
    ["^"],
    ["&"],
    ["<<", ">>"],
    ["+", "-"],
    ["*", "/", "%"]
  ];
  var Parser = class {
    toks;
    i = 0;
    pragmas = {};
    constructor(toks) {
      this.toks = toks;
    }
    peek(n = 0) {
      return this.toks[this.i + n] || this.toks[this.toks.length - 1];
    }
    next() {
      return this.toks[this.i++];
    }
    accept(t) {
      return this.peek().tok === t ? this.next() : null;
    }
    expect(t) {
      const tok = this.next();
      if (tok.tok !== t)
        throw new ParseError(`Expected ${Tok[t]}, got ${Tok[tok.tok]}`, tok);
      return tok;
    }
    acceptKeyword(w) {
      const p = this.peek();
      if (p.tok === Tok.KEYWORD && p.text === w) {
        this.i++;
        return true;
      }
      return false;
    }
    parseTypeRef() {
      const t = { name: "" };
      if (this.acceptKeyword("be"))
        t.endian = "be";
      else if (this.acceptKeyword("le"))
        t.endian = "le";
      if (this.acceptKeyword("const"))
        t.const = true;
      t.name = this.expect(Tok.IDENT).text;
      while (this.peek().tok === Tok.STAR) {
        this.next();
        t.pointerDepth = (t.pointerDepth ?? 0) + 1;
      }
      if (this.peek().tok === Tok.LT) {
        this.next();
        const args = [];
        while (this.peek().tok !== Tok.GT && this.peek().tok !== Tok.EOF) {
          args.push(this.parseExpr());
          if (this.accept(Tok.COMMA))
            continue;
          break;
        }
        this.expect(Tok.GT);
        t.templateArgs = args;
      }
      return t;
    }
    parseAttributes() {
      if (!this.accept(Tok.ATTR_OPEN))
        return void 0;
      const attrs = [];
      while (!this.accept(Tok.ATTR_CLOSE)) {
        const name = this.expect(Tok.IDENT).text;
        const args = [];
        if (this.accept(Tok.LPAREN)) {
          while (!this.accept(Tok.RPAREN)) {
            const t = this.next();
            if (t.tok === Tok.STRING)
              args.push(t.text);
            else if (t.tok === Tok.NUMBER)
              args.push(t.num);
            else if (t.tok === Tok.IDENT)
              args.push(t.text);
            if (!this.accept(Tok.COMMA)) {
              this.accept(Tok.RPAREN);
              break;
            }
          }
        }
        attrs.push({ name, args });
        if (!this.accept(Tok.COMMA)) {
          this.expect(Tok.ATTR_CLOSE);
          break;
        }
      }
      return attrs.length ? attrs : void 0;
    }
    parseExpr() {
      return this.parseTernary();
    }
    parseTernary() {
      const cond = this.parseBinary(0);
      if (this.accept(Tok.QUESTION)) {
        const a = this.parseTernary();
        this.expect(Tok.COLON);
        const b = this.parseTernary();
        return { kind: "ternary", cond, a, b };
      }
      return cond;
    }
    parseBinary(level) {
      if (level >= PRECEDENCE.length)
        return this.parseUnary();
      let lhs = this.parseBinary(level + 1);
      while (PRECEDENCE[level].includes(this.peek().text)) {
        const op = this.next().text;
        const rhs = this.parseBinary(level + 1);
        lhs = { kind: "binary", op, lhs, rhs };
      }
      return lhs;
    }
    parseUnary() {
      const t = this.peek();
      if (t.tok === Tok.MINUS) {
        this.next();
        return { kind: "unary", op: "-", operand: this.parseUnary() };
      }
      if (t.tok === Tok.NOT) {
        this.next();
        return { kind: "unary", op: "!", operand: this.parseUnary() };
      }
      if (t.tok === Tok.TILDE) {
        this.next();
        return { kind: "unary", op: "~", operand: this.parseUnary() };
      }
      return this.parsePostfix();
    }
    parsePostfix() {
      let e = this.parsePrimary();
      while (true) {
        if (this.peek().tok === Tok.DOT) {
          this.next();
          e = { kind: "member", obj: e, name: this.expect(Tok.IDENT).text };
        } else if (this.peek().tok === Tok.LBRACKET) {
          this.next();
          const idx = this.parseExpr();
          this.expect(Tok.RBRACKET);
          e = { kind: "index", obj: e, idx };
        } else
          break;
      }
      return e;
    }
    parsePrimary() {
      const t = this.next();
      switch (t.tok) {
        case Tok.NUMBER:
          return { kind: "num", value: t.num };
        case Tok.STRING:
          return { kind: "str", value: t.text };
        case Tok.CHAR:
          return { kind: "char", value: t.text };
        case Tok.LPAREN: {
          const e = this.parseExpr();
          this.expect(Tok.RPAREN);
          return e;
        }
        case Tok.IDENT:
          if (this.peek().tok === Tok.LPAREN) {
            this.next();
            const args = [];
            if (!this.accept(Tok.RPAREN)) {
              while (true) {
                args.push(this.parseExpr());
                if (this.accept(Tok.COMMA))
                  continue;
                this.expect(Tok.RPAREN);
                break;
              }
            }
            return { kind: "call", name: t.text, args };
          }
          return { kind: "ident", name: t.text };
        case Tok.KEYWORD:
          if (t.text === "true")
            return { kind: "bool", value: true };
          if (t.text === "false")
            return { kind: "bool", value: false };
          if (t.text === "null")
            return { kind: "null" };
          if (t.text === "this")
            return { kind: "this" };
          if (t.text === "parent")
            return { kind: "parent" };
          if (t.text === "sizeof" || t.text === "addressof" || t.text === "typenameof") {
            const operand = this.parsePostfix();
            return { kind: t.text, operand };
          }
          throw new ParseError(`Unexpected keyword '${t.text}' in expression`, t);
        default:
          throw new ParseError(`Unexpected token '${t.text}' in expression`, t);
      }
    }
    parseStmt() {
      const p = this.peek();
      if (p.tok === Tok.KEYWORD) {
        switch (p.text) {
          case "if": {
            this.next();
            this.expect(Tok.LPAREN);
            const cond = this.parseExpr();
            this.expect(Tok.RPAREN);
            const then = this.parseBlockOrSingle();
            let els;
            if (this.acceptKeyword("else"))
              els = this.parseBlockOrSingle();
            return { kind: "if", cond, then, else: els };
          }
          case "while": {
            this.next();
            this.expect(Tok.LPAREN);
            const cond = this.parseExpr();
            this.expect(Tok.RPAREN);
            const body = this.parseBlockOrSingle();
            return { kind: "while", cond, body };
          }
          case "break":
            this.next();
            this.accept(Tok.SEMI);
            return { kind: "break" };
          case "continue":
            this.next();
            this.accept(Tok.SEMI);
            return { kind: "continue" };
        }
      }
      if (p.tok === Tok.IDENT && this.peek(1).tok === Tok.ASSIGN) {
        const name2 = this.next().text;
        this.next();
        const value = this.parseExpr();
        this.accept(Tok.SEMI);
        return { kind: "vardecl", name: name2, value };
      }
      const type = this.parseTypeRef();
      const attributes = this.parseAttributes();
      const name = this.expect(Tok.IDENT).text;
      if (this.peek().tok === Tok.ASSIGN) {
        this.next();
        const value = this.parseExpr();
        this.accept(Tok.SEMI);
        return { kind: "vardecl", name, value };
      }
      let arraySize;
      let whileCond;
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
      let placement;
      if (this.accept(Tok.ATTRIB)) {
        placement = this.parseExpr();
      }
      this.accept(Tok.SEMI);
      return { kind: "place", type, name, attributes, placement, arraySize, whileCond, unsized };
    }
    parseBlockOrSingle() {
      if (this.accept(Tok.LBRACE)) {
        const body = [];
        while (this.peek().tok !== Tok.RBRACE && this.peek().tok !== Tok.EOF) {
          body.push(this.parseStmt());
        }
        this.expect(Tok.RBRACE);
        return body;
      }
      return [this.parseStmt()];
    }
    parseStructBody() {
      this.expect(Tok.LBRACE);
      const body = [];
      while (this.peek().tok !== Tok.RBRACE && this.peek().tok !== Tok.EOF) {
        body.push(this.parseStmt());
      }
      this.expect(Tok.RBRACE);
      return body;
    }
    // Parse ONE item: pragma, type declaration, or placement statement.
    // Returns false if the next token is RBRACE (end of enclosing block).
    parseDeclOrStmt(types, statements) {
      const p = this.peek();
      if (p.tok === Tok.EOF || p.tok === Tok.RBRACE)
        return false;
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
          case "struct": {
            this.next();
            const name = this.expect(Tok.IDENT).text;
            const body = this.parseStructBody();
            const attributes = this.parseAttributes();
            this.accept(Tok.SEMI);
            types.push({ kind: "struct", name, body, attributes });
            return true;
          }
          case "union": {
            this.next();
            const name = this.expect(Tok.IDENT).text;
            const body = this.parseStructBody();
            const attributes = this.parseAttributes();
            this.accept(Tok.SEMI);
            types.push({ kind: "union", name, body, attributes });
            return true;
          }
          case "enum": {
            this.next();
            const name = this.expect(Tok.IDENT).text;
            let underlying;
            if (this.accept(Tok.COLON))
              underlying = this.parseTypeRef();
            this.expect(Tok.LBRACE);
            const cases = [];
            while (this.peek().tok !== Tok.RBRACE && this.peek().tok !== Tok.EOF) {
              const cn = this.expect(Tok.IDENT).text;
              let value;
              if (this.accept(Tok.ASSIGN))
                value = this.parseExpr();
              cases.push({ name: cn, value });
              if (!this.accept(Tok.COMMA))
                break;
            }
            this.expect(Tok.RBRACE);
            this.accept(Tok.SEMI);
            types.push({ kind: "enum", name, underlying, cases });
            return true;
          }
          case "bitfield": {
            this.next();
            const name = this.expect(Tok.IDENT).text;
            this.expect(Tok.LBRACE);
            const fields = [];
            while (this.peek().tok !== Tok.RBRACE && this.peek().tok !== Tok.EOF) {
              const fname = this.expect(Tok.IDENT).text;
              this.expect(Tok.COLON);
              const size = this.parseExpr();
              fields.push({ name: fname, size });
              if (!this.accept(Tok.COMMA))
                this.accept(Tok.SEMI);
            }
            this.expect(Tok.RBRACE);
            this.expect(Tok.SEMI);
            types.push({ kind: "bitfield", name, fields });
            return true;
          }
          case "using": {
            this.next();
            const name = this.expect(Tok.IDENT).text;
            if (this.peek().tok === Tok.SEMI) {
              this.next();
              return true;
            }
            this.expect(Tok.ASSIGN);
            const type = this.parseTypeRef();
            this.accept(Tok.SEMI);
            types.push({ kind: "using", name, type });
            return true;
          }
          case "fn": {
            this.next();
            const name = this.expect(Tok.IDENT).text;
            this.expect(Tok.LPAREN);
            const params = [];
            if (!this.accept(Tok.RPAREN)) {
              while (true) {
                this.acceptKeyword("auto");
                this.acceptKeyword("ref");
                params.push({ name: this.expect(Tok.IDENT).text });
                if (this.accept(Tok.COMMA))
                  continue;
                this.expect(Tok.RPAREN);
                break;
              }
            }
            const body = this.parseBlockOrSingle();
            types.push({ kind: "fn", name, params, body });
            return true;
          }
          case "namespace": {
            this.next();
            const ns = this.expect(Tok.IDENT).text;
            this.expect(Tok.LBRACE);
            const nBefore = types.length;
            while (this.parseDeclOrStmt(types, statements)) {
            }
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
    parseProgram() {
      const types = [];
      const statements = [];
      while (this.parseDeclOrStmt(types, statements)) {
      }
      return { pragmas: this.pragmas, types, statements };
    }
  };
  function parse(src2) {
    return new Parser(lex(src2)).parseProgram();
  }

  // r2pipe.ts
  var R2Pipe = class {
    r2;
    baseAddress = 0;
    // pattern-space to r2 address translation
    bigEndianDefault = false;
    _fileSize = -1;
    constructor(r2) {
      this.r2 = r2;
    }
    /** Load size in pattern space (ij.core.size minus base). */
    fileSize() {
      if (this._fileSize < 0) {
        try {
          const ij = JSON.parse(this.r2.cmd("ij"));
          this._fileSize = Math.max(0, (ij?.core?.size ?? 0) - this.baseAddress);
        } catch (e) {
          this._fileSize = 0;
        }
      }
      return this._fileSize;
    }
    /** Read raw bytes at address. Returns array of byte values. */
    readBytes(addr, size) {
      if (size <= 0)
        return [];
      let hex = "";
      try {
        hex = this.r2.cmd("p8 " + size + " @ " + (this.baseAddress + addr));
      } catch (e) {
        return [];
      }
      if (!hex)
        return [];
      const clean = hex.replace(/0x/g, "").replace(/[\s,]/g, "");
      const bytes = [];
      for (let i = 0; i + 1 < clean.length && bytes.length < size; i += 2) {
        const b = parseInt(clean.substr(i, 2), 16);
        if (isNaN(b))
          break;
        bytes.push(b);
      }
      return bytes;
    }
    /** Read unsigned integer of given byte size honoring endianness.
     *  64/128-bit reads use BigInt to avoid double precision loss. */
    readUnsigned(addr, size, bigEndian) {
      const be = bigEndian ?? this.bigEndianDefault;
      const bytes = this.readBytes(addr, size);
      if (bytes.length < size)
        return NaN;
      if (size <= 6) {
        let v = 0;
        if (be) {
          for (let i = 0; i < size; i++)
            v = v * 256 + bytes[i];
        } else {
          for (let i = size - 1; i >= 0; i--)
            v = v * 256 + bytes[i];
        }
        return v;
      }
      let b = 0n;
      if (be) {
        for (let i = 0; i < size; i++)
          b = b * 256n + BigInt(bytes[i]);
      } else {
        for (let i = size - 1; i >= 0; i--)
          b = b * 256n + BigInt(bytes[i]);
      }
      return b;
    }
    readSigned(addr, size, bigEndian) {
      const be = bigEndian ?? this.bigEndianDefault;
      let v = this.readUnsigned(addr, size, be);
      const bits = BigInt(size * 8);
      if (typeof v === "bigint") {
        if (v >= 1n << bits - 1n)
          v -= 1n << bits;
        return v;
      }
      if (v >= Math.pow(2, Number(bits) - 1))
        v -= Math.pow(2, Number(bits));
      return v;
    }
    readFloat(addr, size, bigEndian) {
      const be = bigEndian ?? this.bigEndianDefault;
      const bytes = this.readBytes(addr, size);
      if (bytes.length < size)
        return NaN;
      const buf = new ArrayBuffer(size);
      const u8 = new Uint8Array(buf);
      if (be) {
        for (let i = 0; i < size; i++)
          u8[i] = bytes[i];
      } else {
        for (let i = 0; i < size; i++)
          u8[size - 1 - i] = bytes[i];
      }
      const dv = new DataView(buf);
      return size === 4 ? dv.getFloat32(0, false) : dv.getFloat64(0, false);
    }
    /** Read a null-terminated string starting at addr. */
    readStringZ(addr, maxLen = 4096) {
      let s = "";
      for (let i = 0; i < maxLen; i++) {
        const b = this.readBytes(addr + i, 1);
        if (b.length === 0 || b[0] === 0)
          break;
        s += String.fromCharCode(b[0]);
      }
      return s;
    }
    /** Push a C type definition into r2's type database (td). */
    pushType(cdecl) {
      try {
        this.r2.cmd('td "' + cdecl + '"');
      } catch (e) {
      }
    }
    /** Link a type name to an address (tl). */
    linkType(name, addr) {
      try {
        this.r2.cmd("tl " + name + " @ " + addr);
      } catch (e) {
      }
    }
  };

  // evaluator.ts
  var BUILTIN_SIZES = {
    u8: 1,
    i8: 1,
    char: 1,
    bool: 1,
    padding: 1,
    u16: 2,
    i16: 2,
    char16: 2,
    float16: 2,
    u32: 4,
    i32: 4,
    char32: 4,
    float: 4,
    u64: 8,
    i64: 8,
    double: 8,
    u128: 16,
    i128: 16
  };
  var Env = class {
    parent;
    vars = /* @__PURE__ */ new Map();
    constructor(parent) {
      this.parent = parent;
    }
    get(name) {
      if (this.vars.has(name))
        return this.vars.get(name);
      if (this.parent)
        return this.parent.get(name);
      return void 0;
    }
    set(name, v) {
      this.vars.set(name, v);
    }
    /** Assign to existing binding in enclosing scope, or declare locally. */
    assignOrDeclare(name, v) {
      let e = this;
      while (e) {
        if (e.vars.has(name)) {
          e.vars.set(name, v);
          return;
        }
        e = e.parent;
      }
      this.vars.set(name, v);
    }
  };
  var MAX_WHILE_ITER = 1e5;
  var PatternInstance = class {
    program;
    r2;
    cursor = 0;
    patterns = [];
    // top-level patterns in declaration order
    variables = /* @__PURE__ */ new Map();
    // top-level lookup by name
    memberStack = [];
    typeMap = /* @__PURE__ */ new Map();
    enumMap = /* @__PURE__ */ new Map();
    constructor(program, r2) {
      this.program = program;
      this.r2 = r2;
    }
    eval() {
      for (const t of this.program.types)
        this.typeMap.set(t.name, t);
      for (const t of this.program.types) {
        if (t.kind === "enum") {
          const e = t;
          const env2 = new Env();
          let next = 0;
          const cases = [];
          for (const c of e.cases) {
            const v = c.value !== void 0 ? this.toNum(this.evalExpr(c.value, env2)) : next;
            cases.push({ name: c.name, value: v });
            next = v + 1;
          }
          this.enumMap.set(e.name, cases);
        }
      }
      const endian = this.program.pragmas["endian"];
      if (endian && endian.indexOf("big") !== -1)
        this.r2.bigEndianDefault = true;
      const env = new Env();
      this.topEnv = env;
      for (const stmt of this.program.statements) {
        this.evalStmt(stmt, env);
      }
    }
    // ---- type helpers ----
    resolveType(name) {
      return this.typeMap.get(name);
    }
    staticSizeOf(type, env) {
      const t = this.typeMap.get(type.name);
      if (!t)
        return BUILTIN_SIZES[type.name] || 0;
      if (t.kind === "using")
        return this.staticSizeOf(t.type, env);
      if (t.kind === "enum") {
        return t.underlying ? BUILTIN_SIZES[t.underlying.name] || 4 : 4;
      }
      if (t.kind === "struct" || t.kind === "union") {
        const save = this.cursor;
        const child = new Env(env);
        const p = this.instantiateComposite(t, -1, child, void 0, true);
        this.cursor = save;
        return p ? p.size : 0;
      }
      if (t.kind === "bitfield")
        return 1;
      return 0;
    }
    // ---- statements ----
    topEnv;
    evalStmt(stmt, env) {
      switch (stmt.kind) {
        case "place": {
          const pat = this.evalPlace(stmt, env);
          if (pat) {
            env.set(pat.name, pat);
            const mctx = this.memberStack[this.memberStack.length - 1];
            if (mctx) {
              mctx.members.push(pat);
              const end = pat.offset + pat.size;
              if (end > mctx.maxEnd)
                mctx.maxEnd = end;
            } else {
              this.patterns.push(pat);
              this.variables.set(pat.name, pat);
            }
          }
          break;
        }
        case "vardecl": {
          env.assignOrDeclare(stmt.name, this.evalExpr(stmt.value, env));
          break;
        }
        case "if": {
          if (this.toBool(this.evalExpr(stmt.cond, env))) {
            const child = new Env(env);
            for (const s of stmt.then)
              this.evalStmt(s, child);
          } else if (stmt.else) {
            const child = new Env(env);
            for (const s of stmt.else)
              this.evalStmt(s, child);
          }
          break;
        }
        case "block": {
          const child = new Env(env);
          for (const s of stmt.body)
            this.evalStmt(s, child);
          break;
        }
        case "break":
          throw { __control: "break" };
        case "continue":
          throw { __control: "continue" };
        case "while": {
          let iter = 0;
          while (this.toBool(this.evalExpr(stmt.cond, env))) {
            if (++iter > MAX_WHILE_ITER)
              throw new Error("while: too many iterations");
            const child = new Env(env);
            try {
              for (const s of stmt.body)
                this.evalStmt(s, child);
            } catch (e) {
              if (e && e.__control === "break")
                break;
              if (e && e.__control === "continue")
                continue;
              throw e;
            }
          }
          break;
        }
        default:
          break;
      }
    }
    // ---- placement ----
    evalPlace(stmt, env) {
      if (stmt.kind !== "place")
        return null;
      const type = stmt.type;
      let addr;
      if (stmt.placement) {
        addr = this.toNum(this.evalExpr(stmt.placement, env));
      } else {
        addr = this.cursor;
      }
      const pat = {
        name: stmt.name,
        typeName: type.name,
        offset: addr,
        size: 0
      };
      if (stmt.arraySize !== void 0 || stmt.unsized) {
        const n = stmt.arraySize !== void 0 ? this.toNum(this.evalExpr(stmt.arraySize, env)) : Infinity;
        pat.children = [];
        const elemSize = this.staticSizeOf(type, env);
        let count = 0;
        const eof = this.r2.fileSize();
        for (; ; ) {
          if (count >= n)
            break;
          if (stmt.unsized && addr + count * elemSize + elemSize > eof)
            break;
          if (count > 1e5)
            throw new Error("array: too many elements");
          const ep = this.instantiateScalarOrComposite(type, addr + count * elemSize, env, pat.name + "[" + count + "]");
          if (ep) {
            ep.name = pat.name + "[" + count + "]";
            pat.children.push(ep);
          }
          count++;
        }
        pat.size = elemSize * count;
        this.cursor = addr + pat.size;
      } else if (stmt.whileCond) {
        pat.children = [];
        let iter = 0;
        const elemSize = this.staticSizeOf(type, env) || 1;
        let a = addr;
        while (this.toBool(this.evalExpr(stmt.whileCond, env))) {
          if (++iter > MAX_WHILE_ITER)
            throw new Error("array while: too many iterations");
          const ep = this.instantiateScalarOrComposite(type, a, env, stmt.name + "[" + (iter - 1) + "]");
          if (ep)
            pat.children.push(ep);
          a += elemSize;
        }
        pat.size = a - addr;
        this.cursor = a;
      } else {
        const p = this.instantiateScalarOrComposite(type, addr, env, stmt.name);
        pat.value = p ? p.value : void 0;
        pat.children = p ? p.children : void 0;
        pat.size = p ? p.size : 0;
        this.cursor = addr + pat.size;
      }
      return pat;
    }
    /** Instantiate one element of the given type at addr (scalar read or composite). */
    instantiateScalarOrComposite(type, addr, env, name) {
      const decl = this.typeMap.get(type.name);
      if (decl && (decl.kind === "struct" || decl.kind === "union")) {
        const child = new Env(env);
        return this.instantiateComposite(decl, addr, child, name);
      }
      const be = type.endian === "be" ? true : type.endian === "le" ? false : void 0;
      let size = this.staticSizeOf(type, env);
      let value;
      if (type.name === "str" || type.name === "strz") {
        value = this.r2.readStringZ(addr);
        size = value.length + (type.name === "strz" ? 1 : 0);
      } else if (type.name === "float" || type.name === "double" || type.name === "float16") {
        value = this.r2.readFloat(addr, size, be);
      } else if (type.name === "char") {
        value = this.r2.readUnsigned(addr, 1, be);
      } else if (type.name === "bool") {
        value = this.r2.readUnsigned(addr, 1, be) !== 0;
      } else if (type.name === "padding") {
        value = 0;
      } else {
        const signed = /^i(8|16|32|64|128)$/.test(type.name);
        value = signed ? this.r2.readSigned(addr, size, be) : this.r2.readUnsigned(addr, size, be);
        const ed = this.typeMap.get(type.name);
        if (ed && ed.kind === "enum")
          value = value;
      }
      return { name, typeName: type.name, offset: addr, size, value };
    }
    /** Instantiate struct/union at base addr, evaluating its body. */
    instantiateComposite(decl, base, env, name, dryRun = false) {
      const pat = { name: name ?? decl.name, typeName: decl.name, offset: base, size: 0 };
      const members = [];
      const isUnion = decl.kind === "union";
      const saveCursor = this.cursor;
      this.cursor = base;
      const mctx = { members, maxEnd: base };
      this.memberStack.push(mctx);
      try {
        for (const s of decl.body) {
          if (s.kind !== "place") {
            if (!dryRun)
              this.evalStmt(s, env);
            continue;
          }
          const mp = this.evalPlace(s, env);
          if (mp) {
            env.set(mp.name, mp);
            const end = mp.offset + mp.size;
            if (end > mctx.maxEnd)
              mctx.maxEnd = end;
            if (!dryRun) {
              members.push(mp);
            }
          }
        }
        pat.children = members;
        pat.size = Math.max(mctx.maxEnd - base, 0);
        if (isUnion)
          this.cursor = saveCursor;
      } finally {
        this.memberStack.pop();
        const consumed = pat.size;
        this.cursor = dryRun ? saveCursor : base + consumed;
      }
      return pat;
    }
    // ---- expressions ----
    toBool(v) {
      if (v === void 0 || v === null)
        return false;
      if (typeof v === "number")
        return v !== 0;
      if (typeof v === "boolean")
        return v;
      return true;
    }
    toNum(v) {
      if (typeof v === "number")
        return v;
      if (typeof v === "bigint")
        return Number(v);
      if (typeof v === "boolean")
        return v ? 1 : 0;
      if (v && typeof v === "object" && "value" in v)
        return this.toNum(v.value);
      return Number(v);
    }
    evalExpr(expr, env) {
      switch (expr.kind) {
        case "num":
          return expr.value;
        case "str":
          return expr.value;
        case "bool":
          return expr.value;
        case "char":
          return expr.value;
        case "null":
          return null;
        case "ident": {
          const v = env.get(expr.name);
          if (v === void 0) {
            const parts = expr.name.split("::");
            if (parts.length === 2) {
              const cases = this.enumMap.get(parts[0]);
              if (cases) {
                for (const c of cases)
                  if (c.name === parts[1])
                    return c.value;
              }
            }
            return void 0;
          }
          return v;
        }
        case "member": {
          const obj = this.evalExpr(expr.obj, env);
          if (obj && typeof obj === "object" && obj.children) {
            for (const c of obj.children)
              if (c.name === expr.name)
                return c;
          }
          return void 0;
        }
        case "index": {
          const obj = this.evalExpr(expr.obj, env);
          const idx = this.toNum(this.evalExpr(expr.idx, env));
          if (obj && typeof obj === "object" && obj.children) {
            if (obj.children[idx])
              return obj.children[idx];
            for (const c of obj.children)
              if (c.name === obj.name + "[" + idx + "]")
                return c;
          }
          return void 0;
        }
        case "binary": {
          const l = this.evalExpr(expr.lhs, env);
          const r = this.evalExpr(expr.rhs, env);
          const ln = this.toNum(l), rn = this.toNum(r);
          switch (expr.op) {
            case "+":
              return ln + rn;
            case "-":
              return ln - rn;
            case "*":
              return ln * rn;
            case "/":
              return rn === 0 ? 0 : Math.floor(ln / rn);
            case "%":
              return rn === 0 ? 0 : ln % rn;
            case "&":
              return ln & rn;
            case "|":
              return ln | rn;
            case "^":
              return ln ^ rn;
            case "<<":
              return ln << rn;
            case ">>":
              return ln >>> rn;
            case "==":
              return ln === rn;
            case "!=":
              return ln !== rn;
            case "<":
              return ln < rn;
            case "<=":
              return ln <= rn;
            case ">":
              return ln > rn;
            case ">=":
              return ln >= rn;
            case "&&":
              return this.toBool(l) && this.toBool(r);
            case "||":
              return this.toBool(l) || this.toBool(r);
            case "^^":
              return this.toBool(l) !== this.toBool(r);
          }
          return void 0;
        }
        case "unary": {
          const v = this.evalExpr(expr.operand, env);
          if (expr.op === "-")
            return -this.toNum(v);
          if (expr.op === "!")
            return !this.toBool(v);
          if (expr.op === "~")
            return ~this.toNum(v);
          return v;
        }
        case "ternary":
          return this.toBool(this.evalExpr(expr.cond, env)) ? this.evalExpr(expr.a, env) : this.evalExpr(expr.b, env);
        case "sizeof": {
          if (expr.operand.kind === "ident") {
            const v2 = env.get(expr.operand.name);
            if (v2 && typeof v2 === "object" && "size" in v2)
              return v2.size;
            return this.staticSizeOf({ name: expr.operand.name }, env);
          }
          const v = this.evalExpr(expr.operand, env);
          return v && typeof v === "object" && "size" in v ? v.size : 0;
        }
        case "addressof": {
          const v = this.evalExpr(expr.operand, env);
          return v && typeof v === "object" && "offset" in v ? v.offset : void 0;
        }
        case "this":
          return env.get("this");
        case "parent":
          return env.parent ? env.parent : void 0;
        case "call":
          return void 0;
        default:
          return void 0;
      }
    }
    // ---- dump ----
    dump() {
      for (const p of this.patterns)
        this.dumpPattern(p, 0);
    }
    dumpPattern(p, indent) {
      const pad = "".padStart(indent * 2, " ");
      const addr = "0x" + p.offset.toString(16).padStart(8, "0");
      let line = pad + p.name + " (" + p.typeName + ") @ " + addr;
      if (p.children && p.children.length) {
        line += " size=" + p.size;
        console.log(line);
        for (const c of p.children)
          this.dumpPattern(c, indent + 1);
      } else {
        let v = p.value;
        if (typeof v === "bigint") {
          line += " = " + v + " (0x" + v.toString(16) + ")";
        } else if (typeof v === "number") {
          const isFloat = p.typeName === "float" || p.typeName === "double" || p.typeName === "float16";
          if (!isFloat && Number.isInteger(v)) {
            const ecases = this.enumMap.get(p.typeName);
            const ec = ecases && ecases.find((c) => c.value === v);
            line += " = " + v + " (" + (v < 0 ? "-0x" + (-v).toString(16) : "0x" + v.toString(16)) + ")" + (ec ? " = " + p.typeName + "::" + ec.name : "");
          } else
            line += " = " + v;
        } else if (typeof v === "string") {
          line += ' = "' + v.replace(/[\x00-\x1f\x7f-\xff\\"]/g, (c) => {
            const esc = { "\n": "\\n", "\r": "\\r", "	": "\\t", "\\": "\\\\", '"': '\\"' };
            if (esc[c])
              return esc[c];
            return "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0");
          }) + '"';
        } else if (typeof v === "boolean") {
          line += " = " + v;
        } else {
          line += " size=" + p.size;
        }
        console.log(line);
      }
    }
    get(name) {
      return this.variables.get(name);
    }
  };

  // index.ts
  function runHexpat(src2, r2Bridge) {
    const program = parse(src2);
    const pipe = new R2Pipe(r2Bridge);
    let base = 0;
    const ba = (program.pragmas["base_address"] || "").match(/0x[0-9a-fA-F]+|\d+/);
    if (ba) {
      base = parseInt(ba[0]);
    } else {
      try {
        const ij = r2Bridge.cmdj("ij");
        if (ij && ij.bin && ij.bin.baddr)
          base = ij.bin.baddr;
      } catch (e) {
      }
    }
    pipe.baseAddress = base;
    const instance = new PatternInstance(program, pipe);
    instance.eval();
    return instance;
  }
  (function() {
    const r2 = globalThis.r2;
    if (!r2 || !r2.plugin)
      return;
    function usage() {
      console.log("Usage: hexpat [file.hexpat] - evaluate an ImHex pattern file");
    }
    function hexpatCommand(cmd) {
      const args = cmd.substr("hexpat".length).trim();
      if (args === "" || args === "-h" || args === "--help") {
        usage();
        return;
      }
      const filename = args;
      const src2 = r2.cmd("cat " + filename);
      if (!src2 || src2.trim() === "") {
        console.error("hexpat: cannot read " + filename);
        return;
      }
      const instance = runHexpat(src2, r2);
      instance.dump();
    }
    r2.unload("core", "hexpat");
    r2.plugin("core", function() {
      return {
        name: "hexpat",
        license: "MIT",
        desc: "evaluate ImHex pattern (.hexpat) files",
        call: function(cmd) {
          if (cmd.startsWith("hexpat")) {
            try {
              hexpatCommand(cmd);
            } catch (e) {
              console.error("hexpat: " + String(e));
            }
            return true;
          }
          return false;
        }
      };
    });
  })();

  // test_parser.ts
  var src = `
struct Header {
    u32 magic;
    u32 version;
};
Header header @ 0x0;
u32 checksum @ 0x8;
`;
  var mockBuffer = [127, 69, 76, 70, 1, 2, 0, 0, 170, 187, 204, 221];
  var mockR2 = {
    cmd: function(c) {
      const m = c.match(/^p8 (\d+) @ (\d+)$/);
      if (m) {
        const size = parseInt(m[1], 10);
        const addr = parseInt(m[2], 10);
        let s = "";
        for (let i = 0; i < size; i++) {
          const b = mockBuffer[addr + i];
          s += b === void 0 ? "00" : b.toString(16).padStart(2, "0");
        }
        return s;
      }
      return "";
    }
  };
  console.log("[test] running pipeline...");
  var inst = runHexpat(src, mockR2);
  inst.dump();
  var header = inst.get("header");
  if (!header)
    throw new Error("header pattern missing!");
  var magic = header && header.children ? header.children[0] : void 0;
  console.log("[test] magic value: " + (magic ? magic.value : "?") + " expected 1179403647 (0x464c457f)");
  if (!magic || magic.value !== 1179403647)
    throw new Error("magic mismatch!");
  console.log("[test] OK");
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibGV4ZXIudHMiLCAicGFyc2VyLnRzIiwgInIycGlwZS50cyIsICJldmFsdWF0b3IudHMiLCAiaW5kZXgudHMiLCAidGVzdF9wYXJzZXIudHMiXSwKICAibWFwcGluZ3MiOiAiOzs7QUFBQSxNQUFZO0FBQVosR0FBQSxTQUFZQSxNQUFHO0FBQ2IsSUFBQUEsS0FBQUEsS0FBQSxLQUFBLElBQUEsQ0FBQSxJQUFBO0FBQUssSUFBQUEsS0FBQUEsS0FBQSxPQUFBLElBQUEsQ0FBQSxJQUFBO0FBQU8sSUFBQUEsS0FBQUEsS0FBQSxTQUFBLElBQUEsQ0FBQSxJQUFBO0FBQVMsSUFBQUEsS0FBQUEsS0FBQSxRQUFBLElBQUEsQ0FBQSxJQUFBO0FBQVEsSUFBQUEsS0FBQUEsS0FBQSxRQUFBLElBQUEsQ0FBQSxJQUFBO0FBQVEsSUFBQUEsS0FBQUEsS0FBQSxNQUFBLElBQUEsQ0FBQSxJQUFBO0FBQ3JDLElBQUFBLEtBQUFBLEtBQUEsV0FBQSxJQUFBLENBQUEsSUFBQTtBQUFXLElBQUFBLEtBQUFBLEtBQUEsWUFBQSxJQUFBLENBQUEsSUFBQTtBQUFZLElBQUFBLEtBQUFBLEtBQUEsT0FBQSxJQUFBLENBQUEsSUFBQTtBQUFPLElBQUFBLEtBQUFBLEtBQUEsTUFBQSxJQUFBLENBQUEsSUFBQTtBQUFNLElBQUFBLEtBQUFBLEtBQUEsT0FBQSxJQUFBLEVBQUEsSUFBQTtBQUFPLElBQUFBLEtBQUFBLEtBQUEsUUFBQSxJQUFBLEVBQUEsSUFBQTtBQUMzQyxJQUFBQSxLQUFBQSxLQUFBLFFBQUEsSUFBQSxFQUFBLElBQUE7QUFBUSxJQUFBQSxLQUFBQSxLQUFBLFFBQUEsSUFBQSxFQUFBLElBQUE7QUFBUSxJQUFBQSxLQUFBQSxLQUFBLFFBQUEsSUFBQSxFQUFBLElBQUE7QUFBUSxJQUFBQSxLQUFBQSxLQUFBLFFBQUEsSUFBQSxFQUFBLElBQUE7QUFBUSxJQUFBQSxLQUFBQSxLQUFBLFVBQUEsSUFBQSxFQUFBLElBQUE7QUFBVSxJQUFBQSxLQUFBQSxLQUFBLFVBQUEsSUFBQSxFQUFBLElBQUE7QUFDMUMsSUFBQUEsS0FBQUEsS0FBQSxNQUFBLElBQUEsRUFBQSxJQUFBO0FBQU0sSUFBQUEsS0FBQUEsS0FBQSxPQUFBLElBQUEsRUFBQSxJQUFBO0FBQU8sSUFBQUEsS0FBQUEsS0FBQSxNQUFBLElBQUEsRUFBQSxJQUFBO0FBQU0sSUFBQUEsS0FBQUEsS0FBQSxPQUFBLElBQUEsRUFBQSxJQUFBO0FBQU8sSUFBQUEsS0FBQUEsS0FBQSxTQUFBLElBQUEsRUFBQSxJQUFBO0FBQVMsSUFBQUEsS0FBQUEsS0FBQSxLQUFBLElBQUEsRUFBQSxJQUFBO0FBQUssSUFBQUEsS0FBQUEsS0FBQSxLQUFBLElBQUEsRUFBQSxJQUFBO0FBQUssSUFBQUEsS0FBQUEsS0FBQSxLQUFBLElBQUEsRUFBQSxJQUFBO0FBQUssSUFBQUEsS0FBQUEsS0FBQSxJQUFBLElBQUEsRUFBQSxJQUFBO0FBQUksSUFBQUEsS0FBQUEsS0FBQSxLQUFBLElBQUEsRUFBQSxJQUFBO0FBQUssSUFBQUEsS0FBQUEsS0FBQSxLQUFBLElBQUEsRUFBQSxJQUFBO0FBQUssSUFBQUEsS0FBQUEsS0FBQSxPQUFBLElBQUEsRUFBQSxJQUFBO0FBQ2hFLElBQUFBLEtBQUFBLEtBQUEsSUFBQSxJQUFBLEVBQUEsSUFBQTtBQUFJLElBQUFBLEtBQUFBLEtBQUEsSUFBQSxJQUFBLEVBQUEsSUFBQTtBQUFJLElBQUFBLEtBQUFBLEtBQUEsSUFBQSxJQUFBLEVBQUEsSUFBQTtBQUFJLElBQUFBLEtBQUFBLEtBQUEsSUFBQSxJQUFBLEVBQUEsSUFBQTtBQUFJLElBQUFBLEtBQUFBLEtBQUEsSUFBQSxJQUFBLEVBQUEsSUFBQTtBQUFJLElBQUFBLEtBQUFBLEtBQUEsSUFBQSxJQUFBLEVBQUEsSUFBQTtBQUFJLElBQUFBLEtBQUFBLEtBQUEsUUFBQSxJQUFBLEVBQUEsSUFBQTtBQUFRLElBQUFBLEtBQUFBLEtBQUEsTUFBQSxJQUFBLEVBQUEsSUFBQTtBQUFNLElBQUFBLEtBQUFBLEtBQUEsUUFBQSxJQUFBLEVB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QUUsYUFBSyxJQUFJLE9BQU8sSUFBSTtBQUFHLGFBQUs7QUFBRyxlQUFPO0FBQUc7TUFBVTtBQUN2RSxVQUFJLFFBQVEsTUFBTTtBQUFFLGFBQUssSUFBSSxJQUFJLElBQUk7QUFBRyxhQUFLO0FBQUcsZUFBTztBQUFHO01BQVU7QUFDcEUsVUFBSSxRQUFRLE1BQU07QUFBRSxhQUFLLElBQUksSUFBSSxJQUFJO0FBQUcsYUFBSztBQUFHLGVBQU87QUFBRztNQUFVO0FBQ3BFLFVBQUksUUFBUSxNQUFNO0FBQUUsYUFBSyxJQUFJLElBQUksSUFBSTtBQUFHLGFBQUs7QUFBRyxlQUFPO0FBQUc7TUFBVTtBQUNwRSxVQUFJLFFBQVEsTUFBTTtBQUFFLGFBQUssSUFBSSxJQUFJLElBQUk7QUFBRyxhQUFLO0FBQUcsZUFBTztBQUFHO01BQVU7QUFDcEUsVUFBSSxRQUFRLE1BQU07QUFBRSxhQUFLLElBQUksS0FBSyxJQUFJO0FBQUcsYUFBSztBQUFHLGVBQU87QUFBRztNQUFVO0FBQ3JFLFVBQUksUUFBUSxNQUFNO0FBQUUsYUFBSyxJQUFJLEtBQUssSUFBSTtBQUFHLGFBQUs7QUFBRyxlQUFPO0FBQUc7TUFBVTtBQUNyRSxVQUFJLFFBQVEsTUFBTTtBQUFFLGFBQUssSUFBSSxRQUFRLElBQUk7QUFBRyxhQUFLO0FBQUcsZUFBTztBQUFHO01BQVU7QUFDeEUsVUFBSSxRQUFRLE1BQU07QUFBRSxhQUFLLElBQUksTUFBTSxJQUFJO0FBQUcsYUFBSztBQUFHLGVBQU87QUFBRztNQUFVO0FBQ3RFLFVBQUksUUFBUSxNQUFNO0FBQUUsYUFBSyxJQUFJLFFBQVEsSUFBSTtBQUFHLGFBQUs7QUFBRyxlQUFPO0FBQUc7TUFBVTtBQUN4RSxVQUFJLFFBQVEsTUFBTTtBQUFFLGFBQUssSUFBSSxRQUFRLElBQUk7QUFBRyxhQUFLO0FBQUcsZUFBTztBQUFHO01BQVU7QUFDeEUsVUFBSSxRQUFRLE1BQU07QUFBRSxhQUFLLElBQUksT0FBTyxJQUFJO0FBQUcsYUFBSztBQUFHLGVBQU87QUFBRztNQUFVO0FBRXZFLGNBQVEs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QztBQUM3QixlQUFNLE1BQU0sU0FBWSxPQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUUsU0FBUyxHQUFHLEdBQUc7UUFDL0Q7QUFDQSxlQUFPO01BQ1Q7QUFDQSxhQUFPO0lBQUc7O0FBSWQsVUFBUSxJQUFJLDRCQUE0QjtBQUN4QyxNQUFNLE9BQU8sVUFBVSxLQUFLLE1BQU07QUFDbEMsT0FBSyxLQUFJO0FBRVQsTUFBTSxTQUFTLEtBQUssSUFBSSxRQUFRO0FBQ2hDLE1BQUksQ0FBQztBQUFRLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUN0RCxNQUFNLFFBQVEsVUFBVSxPQUFPLFdBQVcsT0FBTyxTQUFTLENBQUMsSUFBSTtBQUMvRCxVQUFRLElBQUksMEJBQTBCLFFBQVEsTUFBTSxRQUFRLE9BQU8sbUNBQW1DO0FBQ3RHLE1BQUksQ0FBQyxTQUFTLE1BQU0sVUFBVTtBQUFZLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUMzRSxVQUFRLElBQUksV0FBVzsiLAogICJuYW1lcyI6IFsiVG9rIiwgInNyYyIsICJzIiwgIm5hbWUiLCAic3JjIiwgImVudiIsICJ2IiwgInNyYyJdCn0K
