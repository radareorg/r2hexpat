/// <reference path="./r2.d.ts" />
/**
 * plugin.ts - radare2 core plugin (r2js) running the hexpat library.
 * R2Host implements the library's HexpatHost interface on top of r2 commands.
 */
import { compile, evaluate, pragma, toJson, walkPatterns, HexpatHost, PatternError, PatternInstance, Pattern } from "../lib/index";
import * as A from "../lib/ast";

/** Host reading the data loaded in r2 (`p8`), translated by a base address. */
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

const VERSION = "0.2.0";

const HELP = [
  "Usage: hexpat[?+-jl*es] [args]  # ImHex pattern language",
  "| hexpat [-q] [-I dir] [file]  evaluate file (replacing the loaded ones) and show its patterns",
  "| hexpat                       show the patterns of the loaded files",
  "| hexpat+ [-I dir] file        evaluate file and add it to the loaded ones",
  "| hexpat- [n]                  unload all loaded files (or the nth)",
  "| hexpat-v                     show the r2hexpat version",
  "| hexpatj [file]               show the patterns as JSON",
  "| hexpat* [file]               show the patterns as r2 commands (flags, comments, data hints)",
  "| hexpatl[j]                   list the loaded files and their top-level patterns",
  "| hexpats [file]               one-line summary (types, fields, patterns) or the error, for status bars",
  "| hexpate expr                 evaluate an expression in the context of the last loaded file",
  "| hexpat?                      show this help",
  "| options: -q (evaluate only), -I dir (add #include / import search path)",
  "| file can be 'base64:<data>' to evaluate the encoded source instead of reading a file",
];

interface Session { file: string; program: A.Program; instance: PatternInstance; host: R2Host; }

const B64 = "base64:";
const sessions: Session[] = [];

/** Collect output lines and print them through r_cons at once (so ~grep and | work). */
class Out {
  lines: string[] = [];
  push = (s: string): void => { this.lines.push(s); };
  flush(): void { if (this.lines.length) r2.log(this.lines.join("\n")); this.lines = []; }
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
        if (!rest) { out.push("Usage: hexpate expr"); break; }
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
        if (c !== "" && " ?h+-j*les".indexOf(c) < 0) return false;
        hexpatCommand(cmd);
        return true;
      },
    };
  });
})();
