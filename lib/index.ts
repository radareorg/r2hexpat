/// <reference path="./hexpat.d.ts" />
import { parse } from "./parser";
import { R2Pipe } from "./r2pipe";
import { PatternInstance } from "./evaluator";

export { parse, R2Pipe, PatternInstance };

/** Parse and evaluate a hexpat source against the given r2 bridge. Synchronous. */
export function runHexpat(src: string, r2Bridge: any): PatternInstance {
  const program = parse(src);
  const pipe = new R2Pipe(r2Bridge);
  // resolve base address: #pragma base_address wins, else the binary's baddr
  let base = 0;
  const ba = (program.pragmas["base_address"] || "").match(/0x[0-9a-fA-F]+|\d+/);
  if (ba) {
    base = parseInt(ba[0]);
  } else {
    try {
      const ij = r2Bridge.cmdj("ij");
      if (ij && ij.bin && ij.bin.baddr) base = ij.bin.baddr;
    } catch (e) { /* keep 0 */ }
  }
  pipe.baseAddress = base;
  const instance = new PatternInstance(program, pipe);
  instance.eval();
  return instance;
}

// ---------------------------------------------------------------------------
// r2js plugin registration (radare2 embedded JS runtime)
// ---------------------------------------------------------------------------
(function () {
  const r2: any = (globalThis as any).r2;
  if (!r2 || !r2.plugin) return; // not running inside r2

  function usage(): void {
    console.log("Usage: hexpat [-q] [file.hexpat] - evaluate an ImHex pattern file");
    console.log(" -q  quiet: evaluate only, do not dump the patterns");
  }

  function hexpatCommand(cmd: string): void {
    const args = cmd.substr("hexpat".length).trim();
    if (args === "" || args === "-h" || args === "--help") {
      usage();
      return;
    }
    let quiet = false;
    let filename = args;
    if (filename.startsWith("-q ")) { quiet = true; filename = filename.substr(3).trim(); }
    const src = r2.cmd("cat " + filename);
    if (!src || src.trim() === "") {
      console.error("hexpat: cannot read " + filename);
      return;
    }
    const instance = runHexpat(src, r2);
    if (!quiet) instance.dump();
  }

  r2.unload("core", "hexpat");
  r2.plugin("core", function () {
    return {
      name: "hexpat",
      license: "MIT",
      desc: "evaluate ImHex pattern (.hexpat) files",
      call: function (cmd: string) {
        if (cmd.startsWith("hexpat")) {
          try {
            hexpatCommand(cmd);
          } catch (e) {
            console.error("hexpat: " + String(e));
          }
          return true;
        }
        return false;
      },
    };
  });
})();
