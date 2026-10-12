/// <reference path="./r2.d.ts" />
/**
 * plugin.ts - radare2 core plugin (r2js) running the hexpat library.
 * R2Host implements the library's HexpatHost interface on top of r2 commands.
 */
import { compile, evaluate, pragma, toJson, walkPatterns, HexpatHost, PatternError, PatternInstance, Pattern, SearchPattern } from "../lib/index";
import * as A from "../lib/ast";

/** Host accessing r2 I/O (`p8`/`wx`), translated by a base address. */
export class R2Host implements HexpatHost {
  includeDirs: string[] = [];
  constructor(private r2: R2JsBridge, public baseAddress = 0) {}

  size(): number {
    try {
      const ij = JSON.parse(this.r2.cmd("ij"));
      return ij && ij.core && ij.core.size ? ij.core.size : 0;
    } catch (e) { return 0; }
  }

  read(addr: number, size: number): Uint8Array {
    const out = new Uint8Array(size);
    const hex = (this.r2.cmd("p8 " + size + " @ " + (this.baseAddress + addr)) || "").replace(/[^0-9a-fA-F]/g, "");
    for (let i = 0; i < size && i * 2 + 1 < hex.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  write(addr: number, bytes: Uint8Array): void {
    if (!bytes.length) return;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const address = "0x" + (this.baseAddress + addr).toString(16);
    const status = this.r2.cmd("wx " + hex + " @ " + address + ";?v $?").trim();
    if (status !== "0x0" && status !== "0")
      throw new Error("cannot write at " + address + ": open with -w or enable io.cache");
    const actual = this.read(addr, bytes.length);
    if (actual.some((b, i) => b !== bytes[i])) throw new Error("write failed at " + address);
  }

  quiet = false; // drop std::print output (JSON and r2 script output must stay parseable)
  print(msg: string): void { if (!this.quiet) r2.log(msg); }

  /** Read a text file through r2 without printing errors for missing files. */
  readFile(name: string): string | undefined {
    const t = this.r2.cmd("test -f " + name + ";?v $?").trim();
    if (t === "0x1") return undefined;
    const src = this.r2.cmd("cat " + name);
    return src || undefined;
  }

  resolve(path: string, from: string): { name: string; src: string } | undefined {
    const dir = from.lastIndexOf("/") >= 0 ? from.substring(0, from.lastIndexOf("/") + 1) : "";
    const bases = path.startsWith("/") ? [""] : [dir].concat(this.includeDirs.map((d) => d.replace(/\/?$/, "/")));
    for (const b of bases) {
      for (const ext of ["", ".hexpat", ".pat"]) {
        const name = b + path + ext;
        const src = this.readFile(name);
        if (src) return { name, src };
      }
    }
    return undefined;
  }

  /** The binary's base address (`ij.bin.baddr`), used unless a pragma overrides it. */
  static binBaseAddress(r2: R2JsBridge): number {
    try {
      const ij = JSON.parse(r2.cmd("ij"));
      if (ij && ij.bin && ij.bin.baddr) return ij.bin.baddr;
    } catch (e) { /* keep 0 */ }
    return 0;
  }
}

const VERSION = "0.3.0";

const HELP = [
  "Usage: hexpat[?+-jl*espm] [args]  # ImHex pattern language",
  "| hexpat [-q] [-I dir] [file]  evaluate file (replacing the loaded ones) and show its patterns",
  "| hexpat                       show the patterns of the loaded files",
  "| hexpat+ [-I dir] file        evaluate file and add it to the loaded ones",
  "| hexpat- [n]                  unload all loaded files (or the nth)",
  "| hexpat-v                     show the r2hexpat version",
  "| hexpatj [file]               show the patterns as JSON",
  "| hexpat* [file]               show the patterns as r2 commands (flags, comments, data hints)",
  "| hexpatl[j]                   list the loaded files and their top-level patterns",
  "| hexpats [file]               one-line summary (types, fields, patterns) or the error, for status bars",
  "| hexpate expr                 evaluate an expression or assignment in the last loaded file (writes r2 I/O)",
  "| hexpatp[?+=-ijl] ...         create partial instances and masked search patterns (hexpatp? for help)",
  "| hexpatm [options] Type       print a libmagic decoder for a fixed type (hexpatm? for help)",
  "| hexpat?                      show this help",
  "| options: -q (evaluate only), -I dir (add #include / import search path)",
  "| file can be 'base64:<data>' to evaluate the encoded source instead of reading a file",
];

interface Session { file: string; program: A.Program; instance: PatternInstance; host: R2Host; }

const B64 = "base64:";
const sessions: Session[] = [];
const searchPatterns = new Map<string, SearchPattern>();

const PATTERN_HELP = [
  "Usage: hexpatp[?+=-ijl] [options] [args]  # partial instances for /x searches",
  "| hexpatp [options] Type [field=expr ...]       one-shot /x bytes:mask; omitted fields are wildcards",
  "| hexpatp name                                /x bytes:mask of a named instance",
  "| hexpatp+ [options] name Type [field=expr ...]  create a named instance (all fields start unset)",
  "| hexpatp= name field=expr ...                 set fields; zero is a defined value",
  "| hexpatp- name field ...                      unset fields (or aggregates)",
  "| hexpatp- name                               delete the named instance; '*' deletes all",
  "| hexpatpi [options] name|Type [fields ...]    inspect offsets, sizes and set/unset fields",
  "| hexpatpj [options] name|Type [fields ...]    inspect as JSON, including bytes and bit mask",
  "| hexpatpl[j]                                 list named instances (optionally JSON)",
  "| options: -f file (compile types only), -I dir (includes), -a/--align 1|2|4|8|16",
  "| defaults: last loaded file, packed layout (-a 1); pointers use explicit hexpat widths",
  "| fields: nested.member=expr, array[index]=expr; enum names, arithmetic and quoted strings work",
  "| padding stays wildcarded; dynamic layouts and conflicting union fields are rejected",
  "| search: /x `hexpatp -f game.hexpat Player health=100 lives=3`",
];

const MAGIC_HELP = [
  "Usage: hexpatm [options] Type  # libmagic header decoder for pm",
  "| hexpatm [-f file] [-I dir] [-a N] Type  print a magic file for the type's fixed layout",
  "| defaults: types from the last loaded file, packed layout (-a 1)",
  "| options: -f file (compile types only), -I dir (includes), -a/--align 1|2|4|8|16",
  "| fields: nested structs, unions, arrays, strings, 1/2/4/8-byte integers and pointers, float/double",
  "| integers/enums print raw hex; padding is omitted; dynamic layouts and unsupported fields are rejected",
  "| export: hexpatm -f demo/test.hexpat MachHeader > /tmp/macho.magic",
  "| decode: pm /tmp/macho.magic @ 0  (increase block size with b if the header is larger)",
];

/** Collect output lines and print them through r_cons at once (so ~grep and | work). */
class Out {
  lines: string[] = [];
  push = (s: string): void => { this.lines.push(s); };
  flush(): void { if (this.lines.length) r2.log(this.lines.join("\n")); this.lines = []; }
}

/** Read one CLI argument while retaining the remainder as pattern-language expressions. */
function word(src: string): { value: string; rest: string } {
  const s = src.trimStart();
  if (!s) return { value: "", rest: "" };
  const quote = s[0] === '"' || s[0] === "'" ? s[0] : "";
  let value = "", i = quote ? 1 : 0;
  for (; i < s.length; i++) {
    if (quote ? s[i] === quote : /\s/.test(s[i])) return { value, rest: s.substring(i + 1).trimStart() };
    if (quote && s[i] === "\\" && i + 1 < s.length && (s[i + 1] === quote || s[i + 1] === "\\")) i++;
    value += s[i];
  }
  if (quote) throw new Error("unterminated quoted argument");
  return { value, rest: "" };
}

function patternOptions(src: string): { file: string; includeDirs: string[]; alignment?: number; rest: string } {
  const opts = { file: "", includeDirs: [] as string[], alignment: undefined as number | undefined, rest: src.trim() };
  while (opts.rest.startsWith("-")) {
    const flag = word(opts.rest), arg = word(flag.rest);
    if (!["-f", "--file", "-I", "-a", "--align"].includes(flag.value)) throw new Error("unknown layout option '" + flag.value + "'");
    if (!arg.value) throw new Error("missing value for " + flag.value);
    if (flag.value === "-f" || flag.value === "--file") opts.file = arg.value;
    else if (flag.value === "-I") opts.includeDirs.push(arg.value);
    else opts.alignment = Number(arg.value);
    opts.rest = arg.rest;
  }
  return opts;
}

function searchProgram(file: string, includeDirs: string[]): A.Program {
  if (!file) {
    const s = sessions[sessions.length - 1];
    if (!s) throw new Error("no types loaded: use -f file or load a pattern with hexpat");
    if (includeDirs.length) throw new Error("-I requires -f when compiling types");
    return s.program;
  }
  const host = new R2Host(r2);
  host.includeDirs = includeDirs;
  const inline = file.startsWith(B64);
  const src = inline ? b64(file.substring(B64.length), true) : host.readFile(file);
  if (!src) throw new Error("cannot read " + file);
  return compile(src, host, inline ? "base64" : file);
}

function patternCommand(tail: string, out: Out): void {
  const mode = tail[0] && "+=-ijl?".includes(tail[0]) ? tail[0] : "";
  let rest = (mode ? tail.substring(1) : tail).trim();
  if (mode === "?" || (!mode && (!rest || rest === "-h" || rest === "--help"))) {
    for (const line of PATTERN_HELP) out.push(line);
    return;
  }
  const named = (name: string): SearchPattern => {
    const p = searchPatterns.get(name);
    if (!p) throw new Error("no search instance '" + name + "'; use hexpatpl or hexpatp+");
    return p;
  };
  if (mode === "l") {
    const items = Array.from(searchPatterns, ([name, p]) => ({ name, type: p.type, size: p.size, alignment: p.alignment,
      state: p.state(), defined: p.fields().filter((f) => f.defined).length, fields: p.fields().length }));
    if (rest === "j") out.push(JSON.stringify(items));
    else if (rest) throw new Error("Usage: hexpatpl[j]");
    else for (const i of items) out.push(i.name + " " + i.type + " size=" + i.size + " align=" + i.alignment + " fields=" + i.defined + "/" + i.fields);
    return;
  }
  if (mode === "=" || mode === "-") {
    const arg = word(rest);
    if (!arg.value) throw new Error(mode === "=" ? "Usage: hexpatp= name field=expr ..." : "Usage: hexpatp- name [field ...]");
    if (mode === "-") {
      if (!arg.rest) {
        if (arg.value === "*") searchPatterns.clear();
        else { named(arg.value); searchPatterns.delete(arg.value); }
      } else {
        const p = named(arg.value), fields = arg.rest.split(/\s+/);
        for (const f of fields) p.state(f); // validate all paths before changing the instance
        for (const f of fields) p.unset(f);
      }
    } else named(arg.value).assign(arg.rest);
    return;
  }
  const opts = patternOptions(rest);
  let arg = word(opts.rest), name = "";
  if (mode === "+") {
    name = arg.value;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error("search instance name must be an identifier");
    if (searchPatterns.has(name)) throw new Error("search instance '" + name + "' already exists; delete it with hexpatp-");
    arg = word(arg.rest);
  }
  if (!arg.value) throw new Error("missing type or instance name; see hexpatp?");
  let p = mode !== "+" && !opts.file ? searchPatterns.get(arg.value) : undefined;
  if (p) {
    name = arg.value;
    if (opts.alignment !== undefined || opts.includeDirs.length || arg.rest) throw new Error("use hexpatp= to update a named instance");
  } else {
    p = new SearchPattern(searchProgram(opts.file, opts.includeDirs), arg.value, { alignment: opts.alignment });
    if (arg.rest) p.assign(arg.rest);
  }
  if (mode === "+") { searchPatterns.set(name, p); return; }
  if (mode === "j") out.push(JSON.stringify({ ...(name ? { name } : {}), ...p.toJSON() }));
  else if (mode === "i") {
    out.push((name ? name + " " : "") + p.type + " size=" + p.size + " align=" + p.alignment + " (" + p.state() + ")");
    for (const f of p.fields()) out.push("  0x" + f.offset.toString(16).padStart(4, "0") + " " + String(f.size).padStart(4) +
      " " + f.path + " (" + f.type + (f.bits === undefined ? "" : ":" + f.bits) + ") = " + (f.defined ? JSON.stringify(f.value) : "unset"));
  } else out.push(p.toR2());
}

function magicCommand(rest: string, out: Out): void {
  if (!rest || ["?", "-h", "--help"].includes(rest)) {
    for (const line of MAGIC_HELP) out.push(line);
    return;
  }
  const opts = patternOptions(rest), arg = word(opts.rest);
  if (!arg.value || arg.rest) throw new Error("Usage: hexpatm [-f file] [-I dir] [-a N] Type");
  const p = new SearchPattern(searchProgram(opts.file, opts.includeDirs), arg.value, { alignment: opts.alignment });
  out.push(p.toMagic());
}

function parseArgs(args: string[]): { quiet: boolean; includeDirs: string[]; file: string } {
  const r = { quiet: false, includeDirs: [] as string[], file: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-q") r.quiet = true;
    else if (a === "-I") r.includeDirs.push(args[++i] || ".");
    else r.file = a;
  }
  return r;
}

function load(file: string, includeDirs: string[], quiet = false): Session {
  const host = new R2Host(r2);
  const inline = file.startsWith(B64);
  const src = inline ? b64(file.substring(B64.length), true) : host.readFile(file);
  if (inline) file = "base64";
  else if (!src || src.trim() === "") throw new Error("cannot read " + file);
  host.includeDirs = includeDirs;
  host.quiet = quiet;
  const program = compile(src || "", host, file);
  const ba = (pragma(program, "base_address") || "").match(/0x[0-9a-fA-F]+|\d+/);
  host.baseAddress = ba ? parseInt(ba[0]) : R2Host.binBaseAddress(r2);
  return { file, program, instance: evaluate(program, host), host };
}

/** Sessions to show: the given file (replacing the loaded ones) or all loaded. */
function target(args: string[], quietPrints = false): Session[] {
  const a = parseArgs(args);
  if (!a.file) return sessions;
  const s = load(a.file, a.includeDirs, quietPrints);
  s.host.quiet = false;
  sessions.length = 0;
  sessions.push(s);
  return a.quiet ? [] : sessions;
}

function flagName(path: string[]): string {
  return "hexpat." + path.map((p) => p.replace(/[^a-zA-Z0-9_]/g, "_") || "_").join(".");
}

/** Printable ASCII only (non-printables become '.'), capped for comments. */
function printable(s: string, max = 64): string {
  const t = s.replace(/[^\x20-\x7e]/g, ".");
  return t.length > max ? t.substring(0, max) + "..." : t;
}

function sanitize(s: string): string {
  return s.replace(/[\x00-\x1f;|>@`~$#"\\]/g, "_");
}

/** Integers read better in hex in the disassembly; everything else as formatted. */
function commentValue(inst: PatternInstance, p: Pattern): string {
  const v = inst.value(p);
  if (typeof v === "bigint" && !p.enumInfo && !p.formatFn && !p.transformFn) return v < 0n ? "-0x" + (-v).toString(16) : "0x" + v.toString(16);
  return inst.formatPattern(p, true);
}

function r2script(s: Session, out: Out): void {
  const inst = s.instance;
  const base = s.host.baseAddress;
  walkPatterns(inst, (p: Pattern, path: string[]) => {
    if (p.local || p.section !== 0) return false;
    const addr = "0x" + (base + p.offset).toString(16);
    out.push("f " + flagName(path) + " " + Math.max(1, p.size) + " @ " + addr);
    if (p.kind === "string" || p.kind === "wstring") {
      out.push("Cs " + p.size + " @ " + addr);
      out.push("CCu " + sanitize(p.typeName + " " + p.name + " = " + printable(String(inst.value(p)))) + " @ " + addr);
      return false;
    }
    if (p.kind === "array" && p.proto && !p.proto.isComposite()) {
      if (p.count && p.proto.kind !== "enum") out.push("Cd " + p.proto.size + " " + p.count + " @ " + addr);
      return false;
    }
    if (p.kind === "pointer") {
      out.push("CCu " + sanitize(p.typeName + " " + p.name + " = 0x" + (base + Number(inst.value(p))).toString(16)) + " @ " + addr);
      return true;
    }
    if (!p.isComposite() && p.kind !== "padding") {
      if (p.kind !== "bitfield_field") out.push("Cd " + p.size + " @ " + addr);
      const t = p.kind === "bitfield_field" ? p.typeName + ":" + p.bits : p.typeName;
      out.push("CCu " + sanitize((t ? t + " " : "") + p.name + " = " + commentValue(inst, p)) + " @ " + addr);
    }
    return true;
  });
}

function list(out: Out, json: boolean): void {
  if (json) {
    out.push(JSON.stringify(sessions.map((s, i) => ({
      index: i, file: s.file, base: s.host.baseAddress,
      patterns: s.instance.patterns.map((p) => ({ name: p.name, type: p.typeName, addr: s.host.baseAddress + p.offset, size: p.size })),
    }))));
    return;
  }
  sessions.forEach((s, i) => {
    out.push(i + " " + s.file + " (" + s.instance.patterns.length + " patterns)");
    for (const p of s.instance.patterns) {
      out.push("  0x" + (s.host.baseAddress + p.offset).toString(16).padStart(8, "0") + " " + String(p.size).padStart(6) + "  " + p.name + " (" + p.typeName + ")");
    }
  });
}

/** Number of member declarations in a struct/union/bitfield body (including conditional ones). */
function countFields(body: A.Stmt[]): number {
  let n = 0;
  for (const st of body) {
    switch (st.s) {
      case "decl": n++; break;
      case "multi": n += st.decls.length; break;
      case "if": n += countFields(st.then) + countFields(st.else || []); break;
      case "while": case "for": case "try": case "block": case "nsctx": n += countFields(st.body); break;
      case "match": for (const c of st.cases) n += countFields(c.body); break;
    }
  }
  return n;
}

/** One line summary of the loaded sessions: types with their field counts, functions and placed patterns. */
function stats(ss: Session[]): string {
  const comp: string[] = [];
  let enums = 0, fns = 0, patterns = 0, size = 0;
  for (const s of ss) {
    for (const st of s.program.body) {
      if (st.s === "struct" || st.s === "union" || st.s === "bitfield") comp.push(st.ns.concat(st.name).join("::") + ":" + countFields(st.body));
      else if (st.s === "enum") enums++;
      else if (st.s === "fn") fns++;
    }
    patterns += s.instance.patterns.length;
    for (const p of s.instance.patterns) size += p.size;
  }
  return "types " + comp.length + (comp.length ? " (" + comp.join(" ") + ")" : "") +
    " enums " + enums + " fns " + fns + " patterns " + patterns + " size " + size;
}

function hexpatCommand(cmd: string): void {
  const out = new Out();
  const sub = cmd.substr(6, 1);
  const rest = cmd.substr(sub === " " || sub === "" ? 6 : 7).trim();
  const args = rest.split(/\s+/).filter((x) => x);
  try {
    for (const s of sessions) s.instance.invalidateData();
    switch (sub) {
      case "?": case "h": for (const l of HELP) out.push(l); break;
      case "": case " ":
        if (args.indexOf("-h") >= 0 || args.indexOf("--help") >= 0) { for (const l of HELP) out.push(l); break; }
        const targets = target(args);
        if (targets.length === 0 && args.length === 0) {
          out.push("no patterns loaded, run 'hexpat?' for help");
        } else {
          for (const s of targets) s.instance.dump(out.push, s.host.baseAddress);
        }
        break;
      case "+": {
        const a = parseArgs(args);
        if (!a.file) { out.push("Usage: hexpat+ [-I dir] file"); break; }
        const s = load(a.file, a.includeDirs);
        sessions.push(s);
        if (!a.quiet) out.push((sessions.length - 1) + " " + s.file + " (" + s.instance.patterns.length + " patterns)");
        break;
      }
      case "-": {
        if (rest === "v") out.push(VERSION);
        else if (rest === "" || rest === "*") sessions.length = 0;
        else {
          const n = parseInt(rest, 10);
          if (isNaN(n) || n < 0 || n >= sessions.length) throw new Error("no loaded pattern file #" + rest);
          sessions.splice(n, 1);
        }
        break;
      }
      case "j": {
        const all: any[] = [];
        for (const s of target(args, true)) for (const j of toJson(s.instance, { base: s.host.baseAddress })) all.push(j);
        out.push(JSON.stringify(all));
        break;
      }
      case "*": {
        const ss = target(args, true);
        out.push("fs+hexpat");
        for (const s of ss) r2script(s, out);
        out.push("fs-");
        break;
      }
      case "l": list(out, rest === "j" || args[0] === "j"); break;
      case "s": {
        // errors go to stdout too, so frontends get a single line in any case
        try {
          out.push(stats(target(args, true)));
        } catch (e) {
          out.push("error: " + (e instanceof Error ? e.message : String(e)));
        }
        break;
      }
      case "e": {
        if (!rest) { out.push("Usage: hexpate expr (e.g. header.value = 3)"); break; }
        let s = sessions[sessions.length - 1];
        if (!s) {
          // no pattern loaded: evaluate against the current data with an empty program
          s = { file: "", program: { pragmas: [], body: [] }, instance: evaluate(compile("", undefined), new R2Host(r2, R2Host.binBaseAddress(r2))), host: new R2Host(r2) };
        }
        const v = s.instance.evaluateExpression(rest);
        const d = s.instance.describe(v, s.host.baseAddress);
        if (d !== "") out.push(d);
        break;
      }
      case "p": patternCommand(cmd.substring(7), out); break;
      case "m": magicCommand(rest, out); break;
      default:
        for (const l of HELP) out.push(l);
    }
  } catch (e) {
    out.flush();
    console.error("hexpat: " + (e instanceof PatternError ? "error: " + e.message : e instanceof Error ? e.message : String(e)));
    return;
  }
  out.flush();
}

(function () {
  const r2 = (globalThis as any).r2;
  if (!r2 || !r2.plugin) return; // not running inside r2
  r2.unload("core", "hexpat");
  r2.plugin("core", function () {
    return {
      name: "hexpat",
      license: "MIT",
      desc: "evaluate ImHex pattern (.hexpat) files",
      call: function (cmd: string) {
        if (!cmd.startsWith("hexpat")) return false;
        const c = cmd.charAt(6);
        if (c !== "" && " ?h+-j*lespm".indexOf(c) < 0) return false;
        hexpatCommand(cmd);
        return true;
      },
    };
  });
})();
