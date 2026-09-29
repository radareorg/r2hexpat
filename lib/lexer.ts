/**
 * lexer.ts - tokenizer and preprocessor for the ImHex pattern language.
 *
 * Integers are lexed as BigInt (u128/i128 literals), floats as numbers.
 * String and char literals are byte strings: every JS char holds one byte
 * (0..255) and \u / \U escapes or non-ASCII source text are UTF-8 encoded.
 */

export type TokKind = "id" | "kw" | "num" | "str" | "char" | "op" | "eof";

export interface Token {
  k: TokKind;
  t: string;          // text (identifier / keyword / operator / decoded string)
  v?: bigint | number; // numeric value (bigint for integers, number for floats)
  line: number;
  col: number;
  src: string;        // source name
}

export class PatternError extends Error {
  line: number; col: number; src: string;
  constructor(msg: string, where?: { line: number; col: number; src?: string }) {
    super(where ? msg + " (" + (where.src ? where.src + ":" : "line ") + where.line + ":" + where.col + ")" : msg);
    this.line = where ? where.line : 0;
    this.col = where ? where.col : 0;
    this.src = where && where.src ? where.src : "";
  }
}

const KEYWORDS = new Set([
  "struct", "union", "enum", "bitfield", "using", "namespace", "import", "fn",
  "if", "else", "while", "for", "match", "break", "continue", "return",
  "be", "le", "const", "unsigned", "signed", "this", "parent", "true", "false",
  "null", "sizeof", "addressof", "typenameof", "auto", "ref", "out", "in",
  "try", "catch", "from", "as",
]);

// longest first
const OPS = [
  "<<=", ">>=", "...",
  "::", "==", "!=", "<=", ">=", "<<", ">>", "&&", "||", "^^", "->",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
  "+", "-", "*", "/", "%", "&", "|", "^", "~", "!", "=", "<", ">", "?",
  ",", ";", ":", "@", ".", "(", ")", "{", "}", "[", "]", "$",
];

function utf8(cp: number): string {
  if (cp < 0x80) return String.fromCharCode(cp);
  if (cp < 0x800) return String.fromCharCode(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
  if (cp < 0x10000) return String.fromCharCode(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  return String.fromCharCode(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
}

/** Encode a JS (UTF-16) string as a UTF-8 byte string. */
export function toUtf8(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    out += c < 0x80 ? s[i] : utf8(c);
  }
  return out;
}

/** Tokenize a single source text (no preprocessing). */
export function lex(src: string, srcName = "", firstLine = 1): Token[] {
  const toks: Token[] = [];
  let i = 0, line = firstLine, lineStart = 0;
  const err = (msg: string): never => { throw new PatternError(msg, { line, col: i - lineStart + 1, src: srcName }); };
  const hexDigits = (n: number): number => {
    const s = src.substr(i, n);
    if (s.length !== n || !/^[0-9a-fA-F]+$/.test(s)) err("invalid escape sequence digits");
    i += n;
    return parseInt(s, 16);
  };
  // decode one (possibly escaped) character inside a literal, returning bytes
  const litChar = (inChar: boolean): string => {
    const c = src[i];
    if (c === "\n") err("unterminated literal");
    if (c !== "\\") {
      const cp = src.codePointAt(i)!;
      i += cp > 0xffff ? 2 : 1;
      return utf8(cp);
    }
    i++;
    const e = src[i++];
    switch (e) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "a": return "\x07";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "0": return "\0";
      case "'": return "'";
      case '"': return '"';
      case "\\": return "\\";
      case "x": return String.fromCharCode(hexDigits(2));
      case "u": case "U": {
        const cp = hexDigits(e === "u" ? 4 : 8);
        if (cp >= 0xd800 && cp <= 0xdfff) err("invalid unicode escape: surrogate code point");
        if (cp > 0x10ffff) err("invalid unicode escape: code point out of range");
        if (inChar && cp >= 0x80) err("unicode escape does not fit in a char literal");
        return utf8(cp);
      }
      default: return err("unknown escape sequence '\\" + e + "'");
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line++; i++; lineStart = i; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") { line++; lineStart = i + 1; }
        i++;
      }
      i += 2;
      continue;
    }
    const col = i - lineStart + 1;
    const push = (k: TokKind, t: string, v?: bigint | number) => toks.push({ k, t, v, line, col, src: srcName });
    if (/[0-9]/.test(c)) {
      let m: RegExpMatchArray | null;
      const rest = src.substr(i, 256);
      if ((m = rest.match(/^0[xX]([0-9a-fA-F_']+)([uU]?)/))) {
        push("num", m[0], BigInt("0x" + m[1].replace(/[_']/g, "")));
      } else if ((m = rest.match(/^0[bB]([01_']+)([uU]?)/))) {
        push("num", m[0], BigInt("0b" + m[1].replace(/[_']/g, "")));
      } else if ((m = rest.match(/^0[oO]([0-7_']+)([uU]?)/))) {
        push("num", m[0], BigInt("0o" + m[1].replace(/[_']/g, "")));
      } else if ((m = rest.match(/^([0-9][0-9_']*)(\.)([fFdD])(?![a-zA-Z0-9_])/))) {
        push("num", m[0], parseFloat(m[1].replace(/[_']/g, ""))); // `1.F`
      } else if ((m = rest.match(/^([0-9][0-9_']*)?(\.[0-9]+)?([eE][+-]?[0-9]+)?([uUfFdD]?)/)) && m[0].length) {
        const body = (m[1] || "").replace(/[_']/g, "") + (m[2] || "") + (m[3] || "");
        const suf = m[4].toLowerCase();
        if (m[2] || m[3] || suf === "f" || suf === "d") push("num", m[0], parseFloat(body));
        else push("num", m[0], BigInt(body));
      }
      i += toks[toks.length - 1].t.length;
      if (/[a-zA-Z_]/.test(src[i] || "")) err("invalid numeric literal suffix");
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      for (;;) {
        while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
        if (src[j] === ":" && src[j + 1] === ":" && /[a-zA-Z_]/.test(src[j + 2] || "")) { j += 2; continue; }
        break;
      }
      const s = src.substring(i, j);
      i = j;
      push(KEYWORDS.has(s) ? "kw" : "id", s);
      continue;
    }
    if (c === '"') {
      i++;
      let s = "";
      while (i < src.length && src[i] !== '"') s += litChar(false);
      if (i >= src.length) err("unterminated string literal");
      i++;
      push("str", s);
      continue;
    }
    if (c === "'") {
      i++;
      const s = litChar(true);
      if (src[i] !== "'") err("invalid character literal");
      i++;
      push("char", s, BigInt(s.charCodeAt(0)));
      continue;
    }
    let op = "";
    for (const o of OPS) if (src.startsWith(o, i)) { op = o; break; }
    if (!op) err("unexpected character '" + c + "'");
    i += op.length;
    push("op", op);
  }
  toks.push({ k: "eof", t: "", line, col: i - lineStart + 1, src: srcName });
  return toks;
}

export interface SourceResolver {
  /** Return the source text for an #include / import path, or undefined. */
  (path: string, from: string): { name: string; src: string } | undefined;
}

export interface Preprocessed {
  tokens: Token[];
  pragmas: [string, string][];
}

/**
 * Run the preprocessor (#define, #undef, #ifdef, #ifndef, #else, #endif,
 * #include, #pragma, #error) and tokenize the result.
 */
export function preprocess(src: string, name: string, resolve?: SourceResolver,
  state?: { defines: Map<string, string>; once: Set<string>; pragmas: [string, string][] }): Preprocessed {
  const st = state || { defines: new Map<string, string>(), once: new Set<string>(), pragmas: [] };
  const out: Token[] = [];
  const lines = src.split("\n");
  const cond: boolean[] = [];
  const active = () => cond.every((c) => c);
  let chunk: string[] = [];
  let chunkLine = 1;
  const flush = (nextLine: number) => {
    if (chunk.length) {
      const toks = lex(chunk.join("\n"), name, chunkLine);
      toks.pop();
      for (const t of toks) {
        const d = t.k === "id" ? st.defines.get(t.t) : undefined;
        if (d !== undefined) {
          // define bodies are lexed where they are used, like a text substitution
          const dt = lex(d, name, t.line);
          dt.pop();
          for (const x of dt) out.push({ ...x, col: t.col });
        } else out.push(t);
      }
    }
    chunk = [];
    chunkLine = nextLine;
  };
  let inComment = false;
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    const lt = raw.trim();
    // track block comments so a '#' inside them is not a directive
    if (!inComment && lt.startsWith("#")) {
      flush(n + 2);
      const m = lt.match(/^#\s*([a-zA-Z_]+)\s*(.*)$/);
      const dir = m ? m[1] : "";
      const arg = m ? m[2].replace(/\s*\/\/.*$/, "").trim() : "";
      const where = { line: n + 1, col: 1, src: name };
      if (dir === "ifdef" || dir === "ifndef") { cond.push(st.defines.has(arg) === (dir === "ifdef")); continue; }
      if (dir === "else") { if (!cond.length) throw new PatternError("#else without #if", where); cond[cond.length - 1] = !cond[cond.length - 1]; continue; }
      if (dir === "endif") { if (!cond.length) throw new PatternError("#endif without #if", where); cond.pop(); continue; }
      if (!active()) continue;
      switch (dir) {
        case "define": {
          const dm = arg.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(.*)$/);
          if (!dm) throw new PatternError("invalid #define", where);
          st.defines.set(dm[1], dm[2]);
          break;
        }
        case "undef": st.defines.delete(arg); break;
        case "error": throw new PatternError("#error " + arg, where);
        case "pragma": {
          const pm = arg.match(/^(\S+)\s*(.*)$/);
          if (pm) {
            if (pm[1] === "once") st.once.add(name);
            st.pragmas.push([pm[1], pm[2].trim()]);
          }
          break;
        }
        case "include": {
          const im = arg.match(/^[<"](.*)[>"]$/);
          if (!im) throw new PatternError("invalid #include", where);
          const inc = resolve ? resolve(im[1], name) : undefined;
          if (!inc) throw new PatternError("cannot find include '" + im[1] + "'", where);
          if (st.once.has(inc.name)) break;
          const sub = preprocess(inc.src, inc.name, resolve, st);
          for (const t of sub.tokens) out.push(t);
          break;
        }
        default: throw new PatternError("unknown preprocessor directive '#" + dir + "'", where);
      }
      continue;
    }
    // keep line numbers: inactive lines become empty
    chunk.push(active() ? raw : "");
    // naive block comment tracking (good enough for directive detection)
    let k = 0;
    while (k < raw.length) {
      if (!inComment && raw.startsWith("//", k)) break;
      if (!inComment && raw.startsWith("/*", k)) { inComment = true; k += 2; continue; }
      if (inComment && raw.startsWith("*/", k)) { inComment = false; k += 2; continue; }
      k++;
    }
  }
  flush(lines.length + 1);
  if (cond.length) throw new PatternError("unterminated #ifdef", { line: lines.length, col: 1, src: name });
  if (!state) out.push({ k: "eof", t: "", line: lines.length, col: 1, src: name });
  return { tokens: out, pragmas: st.pragmas };
}
