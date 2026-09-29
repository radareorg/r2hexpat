/// <reference path="./r2.d.ts" />
/**
 * plugin.ts - radare2 core plugin (r2js) running the hexpat library.
 * R2Host implements the library's HexpatHost interface on top of r2 commands.
 */
import { compile, evaluate, pragma, HexpatHost, PatternError } from "../lib/index";

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

  print(msg: string): void { console.log(msg); }

  resolve(path: string, from: string): { name: string; src: string } | undefined {
    const dir = from.lastIndexOf("/") >= 0 ? from.substring(0, from.lastIndexOf("/") + 1) : "";
    const bases = path.startsWith("/") ? [""] : [dir].concat(this.includeDirs.map((d) => d.replace(/\/?$/, "/")));
    for (const b of bases) {
      for (const ext of ["", ".hexpat", ".pat"]) {
        const name = b + path + ext;
        const src = this.r2.cmd("cat " + name);
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

function usage(): void {
  console.log("Usage: hexpat [-q] [-I dir] [file.hexpat] - evaluate an ImHex pattern file");
  console.log(" -q      quiet: evaluate only, do not dump the patterns");
  console.log(" -I dir  add a directory to the #include / import search path");
}

function hexpatCommand(args: string[]): void {
  let quiet = false;
  const includeDirs: string[] = [];
  let file = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-q") quiet = true;
    else if (a === "-I") includeDirs.push(args[++i] || ".");
    else if (a === "-h" || a === "--help") { usage(); return; }
    else file = a;
  }
  if (!file) { usage(); return; }
  const src = r2.cmd("cat " + file);
  if (!src || src.trim() === "") {
    console.error("hexpat: cannot read " + file);
    return;
  }
  const host = new R2Host(r2);
  host.includeDirs = includeDirs;
  const program = compile(src, host, file);
  const ba = (pragma(program, "base_address") || "").match(/0x[0-9a-fA-F]+|\d+/);
  host.baseAddress = ba ? parseInt(ba[0]) : R2Host.binBaseAddress(r2);
  const instance = evaluate(program, host);
  if (!quiet) instance.dump();
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
        try {
          hexpatCommand(cmd.substr(6).trim().split(/\s+/).filter((x) => x));
        } catch (e) {
          console.error("hexpat: " + (e instanceof PatternError ? "error: " + e.message : String(e)));
        }
        return true;
      },
    };
  });
})();
