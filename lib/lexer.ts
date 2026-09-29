export enum Tok {
  EOF, IDENT, KEYWORD, NUMBER, STRING, CHAR,
  ATTR_OPEN, ATTR_CLOSE, COMMA, SEMI, COLON, ATTRIB,
  LPAREN, RPAREN, LBRACE, RBRACE, LBRACKET, RBRACKET,
  PLUS, MINUS, STAR, SLASH, PERCENT, SHL, SHR, AND, OR, XOR, NOT, TILDE,
  EQ, NE, LT, GT, LE, GE, ANDAND, OROR, XORXOR, NOTNOT,
  QUESTION, ARROW, DOTDOT, SCOPE, DOT, ASSIGN,
}

const KEYWORDS = new Set(["struct", "union", "enum", "bitfield", "using", "namespace", "import", "fn", "if", "else", "while", "for", "match", "break", "continue", "return", "be", "le", "const", "unsigned", "signed", "this", "parent", "true", "false", "null", "sizeof", "addressof", "typenameof", "auto", "ref", "out"]);

export interface Token { tok: Tok; text: string; num?: number; line: number; pos: number; }

export function lex(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1, pos = 0;
  const peek = (n = 0) => src[i + n];
  const push = (tok: Tok, text: string, num?: number) => tokens.push({ tok, text, num, line, pos });

  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; pos = 0; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; pos++; continue; }
    if (c === '/' && peek(1) === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && peek(1) === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') { line++; pos = 0; } i++; }
      i += 2; continue;
    }
    // preprocessor directive: '#' word rest-of-line
    if (c === '#') {
      let j = i + 1; while (j < src.length && /[ \t]/.test(src[j])) j++;
      let word = ""; while (j < src.length && /[a-zA-Z_]/.test(src[j])) { word += src[j]; j++; }
      let rest = ""; while (j < src.length && src[j] !== '\n') { rest += src[j]; j++; }
      push(Tok.ATTRIB, word); push(Tok.STRING, rest.trim());
      i = j; continue;
    }
    // attributes [[ ... ]]
    if (c === '[' && peek(1) === '[') {
      push(Tok.ATTR_OPEN, "[["); i += 2; pos += 2;
      while (i < src.length) {
        if (src[i] === ']' && src[i + 1] === ']') { push(Tok.ATTR_CLOSE, "]]"); i += 2; break; }
        if (src[i] === ',') { push(Tok.COMMA, ","); i++; continue; }
        if (src[i] === '"') {
          i++; let s = "";
          while (i < src.length && src[i] !== '"') { if (src[i] === '\\') { s += src[i + 1]; i += 2; } else s += src[i++]; }
          i++; push(Tok.STRING, s); continue;
        }
        if (/\s/.test(src[i])) { if (src[i] === '\n') { line++; pos = 0; } i++; continue; }
        let s = "";
        while (i < src.length && /[\w.\-]/.test(src[i]) && !(src[i] === ']' && src[i + 1] === ']')) { s += src[i]; i++; }
        if (s.length === 0) { s = src[i]; i++; }
        push(Tok.IDENT, s);
      }
      continue;
    }
    // numbers
    if (/[0-9]/.test(c)) {
      let s = "";
      if (c === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
        s = "0x"; i += 2;
        while (i < src.length && /[0-9a-fA-F_]/.test(src[i])) s += src[i++];
        push(Tok.NUMBER, s, parseInt(s.replace(/_/g, ''), 16));
      } else if (c === '0' && (peek(1) === 'b' || peek(1) === 'B')) {
        s = "0b"; i += 2;
        while (i < src.length && /[01_]/.test(src[i])) s += src[i++];
        push(Tok.NUMBER, s, parseInt(s.slice(2).replace(/_/g, ''), 2));
      } else {
        while (i < src.length && /[0-9_]/.test(src[i])) s += src[i++];
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) {
          s += '.'; i++;
          while (i < src.length && /[0-9]/.test(src[i])) s += src[i++];
          push(Tok.NUMBER, s, parseFloat(s));
        } else push(Tok.NUMBER, s, parseInt(s.replace(/_/g, ''), 10));
      }
      pos += s.length; continue;
    }
    // identifiers / keywords with :: chains
    if (/[a-zA-Z_]/.test(c)) {
      let s = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) { s += src[i]; i++; pos++; }
      while (i + 1 < src.length && src[i] === ':' && src[i + 1] === ':') {
        s += "::"; i += 2; pos += 2;
        while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) { s += src[i]; i++; pos++; }
      }
      if (KEYWORDS.has(s)) push(Tok.KEYWORD, s); else push(Tok.IDENT, s);
      continue;
    }
    // strings
    if (c === '"') {
      i++; let s = "";
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { const e = src[i + 1]; s += (e === 'n' ? '\n' : e === 't' ? '\t' : e); i += 2; }
        else s += src[i++];
      }
      i++; pos += s.length + 2; push(Tok.STRING, s); continue;
    }
    // char literals
    if (c === "'") {
      i++; let ch = src[i];
      if (ch === '\\') { ch = src[i + 1]; i += 2; } else i++;
      i++; pos += 3; push(Tok.CHAR, ch, ch.charCodeAt(0)); continue;
    }
    // three-char operators
    if (src.substr(i, 3) === "...") { push(Tok.DOTDOT, "..."); i += 3; pos += 3; continue; }
    // two-char operators
    const two = src.substr(i, 2);
    if (two === "::") { push(Tok.SCOPE, "::"); i += 2; pos += 2; continue; }
    if (two === "==") { push(Tok.EQ, "=="); i += 2; pos += 2; continue; }
    if (two === "!=") { push(Tok.NE, "!="); i += 2; pos += 2; continue; }
    if (two === "<=") { push(Tok.LE, "<="); i += 2; pos += 2; continue; }
    if (two === ">=") { push(Tok.GE, ">="); i += 2; pos += 2; continue; }
    if (two === "<<") { push(Tok.SHL, "<<"); i += 2; pos += 2; continue; }
    if (two === ">>") { push(Tok.SHR, ">>"); i += 2; pos += 2; continue; }
    if (two === "&&") { push(Tok.ANDAND, "&&"); i += 2; pos += 2; continue; }
    if (two === "||") { push(Tok.OROR, "||"); i += 2; pos += 2; continue; }
    if (two === "^^") { push(Tok.XORXOR, "^^"); i += 2; pos += 2; continue; }
    if (two === "!!") { push(Tok.NOTNOT, "!!"); i += 2; pos += 2; continue; }
    if (two === "->") { push(Tok.ARROW, "->"); i += 2; pos += 2; continue; }
    // single-char operators: NOTE: i advances for EVERY case below
    switch (c) {
      case '+': push(Tok.PLUS, "+"); break;
      case '-': push(Tok.MINUS, "-"); break;
      case '*': push(Tok.STAR, "*"); break;
      case '/': push(Tok.SLASH, "/"); break;
      case '%': push(Tok.PERCENT, "%"); break;
      case '&': push(Tok.AND, "&"); break;
      case '|': push(Tok.OR, "|"); break;
      case '^': push(Tok.XOR, "^"); break;
      case '=': push(Tok.ASSIGN, "="); break;
      case '~': push(Tok.TILDE, "~"); break;
      case '!': push(Tok.NOT, "!"); break;
      case '?': push(Tok.QUESTION, "?"); break;
      case ',': push(Tok.COMMA, ","); break;
      case ';': push(Tok.SEMI, ";"); break;
      case ':': push(Tok.COLON, ":"); break;
      case '@': push(Tok.ATTRIB, "@"); break;
      case '.': push(Tok.DOT, "."); break;
      case '(': push(Tok.LPAREN, "("); break;
      case ')': push(Tok.RPAREN, ")"); break;
      case '{': push(Tok.LBRACE, "{"); break;
      case '}': push(Tok.RBRACE, "}"); break;
      case '[': push(Tok.LBRACKET, "["); break;
      case ']': push(Tok.RBRACKET, "]"); break;
      case '<': push(Tok.LT, "<"); break;
      case '>': push(Tok.GT, ">"); break;
      default: throw new Error(`Unexpected character '${c}' at line ${line}`);
    }
    i++; pos++;  // <-- THE FIX: advance after every operator case
  }
  push(Tok.EOF, "");
  return tokens;
}
