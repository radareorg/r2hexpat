/// <reference path="../r2/r2.d.ts" />
/**
 * upstream_r2.ts - the upstream conformance suite run inside radare2's
 * QuickJS in a single r2 process (catches runtime differences with node).
 * usage (from tests/upstream): r2 -q -i ../upstream.r2.js test_data.bin
 */
import { runHexpat, BufferHost } from "../lib/index";
import { VIRTUAL_SOURCES, HOOKS } from "./upstream_hooks";

const size = JSON.parse(r2.cmd("ij")).core.size;
const hex = r2.cmd("p8 " + size + " @ 0").replace(/[^0-9a-fA-F]/g, "");
const data = new Uint8Array(size);
for (let i = 0; i < size; i++) data[i] = parseInt(hex.substr(i * 2, 2), 16);
const xfail = new Set(r2.cmd("cat XFAIL").split("\n").map((l) => l.replace(/#.*/, "").trim()).filter((l) => l));
const files = r2.cmd("ls -q").split("\n").map((l) => l.trim()).filter((f) => f.endsWith(".hexpat")).sort();
let passed = 0;
const unexpected: string[] = [];
for (const f of files) {
  const name = f.replace(/\.hexpat$/, "");
  const base = name.replace(/\.fail$/, "");
  const host = new BufferHost(data, VIRTUAL_SOURCES);
  host.print = () => undefined;
  let err = "";
  try {
    runHexpat(r2.cmd("cat " + f), host, { name: f, hooks: HOOKS[base] ? HOOKS[base]() : {} });
  } catch (e: any) {
    err = e && e.line !== undefined ? e.message : "internal: " + String(e) + (e && e.stack ? "\n" + e.stack : "");
  }
  const ok = name.endsWith(".fail") ? err !== "" && !err.startsWith("internal:") : err === "";
  if (ok) passed++;
  else {
    console.log((xfail.has(name) ? "XFAIL " : "FAIL ") + name + "\n   " + (err || "(no error raised)"));
    if (!xfail.has(name)) unexpected.push(name);
  }
}
console.log("==================================");
console.log("r2: " + passed + "/" + files.length + " passed" + (unexpected.length ? ", unexpected failures: " + unexpected.join(" ") : ""));
