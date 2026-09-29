#!/usr/bin/env node
// Upstream PatternLanguage conformance suite (tests/upstream/*.hexpat, extracted
// by tests/extract_upstream.py) evaluated by the library under node against
// tests/upstream/test_data.bin. A test passes when it evaluates without error;
// *.fail.hexpat tests must raise a pattern error.
//
// usage: node tests/upstream.mjs [-v] [-u] [name ...]
//   -v  show the error of failing tests
//   -u  rewrite tests/upstream/XFAIL with the currently failing tests
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(fs.readFileSync(path.join(here, "testlib.js"), "utf8"));
const { runHexpat, BufferHost, HOOKS, VIRTUAL_SOURCES } = globalThis.hexpat;

const dir = path.join(here, "upstream");
const argv = process.argv.slice(2);
const verbose = argv.includes("-v");
const update = argv.includes("-u");
const only = argv.filter((a) => !a.startsWith("-"));
const xfailPath = path.join(dir, "XFAIL");
const xfail = new Set(fs.existsSync(xfailPath)
  ? fs.readFileSync(xfailPath, "utf8").split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean)
  : []);
const data = new Uint8Array(fs.readFileSync(path.join(dir, "test_data.bin")));

const failing = [], regressions = [], fixed = [];
let total = 0;
const t0 = Date.now();
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".hexpat")).sort()) {
  const name = f.replace(/\.hexpat$/, "");
  const base = name.replace(/\.fail$/, "");
  if (only.length && !only.includes(name) && !only.includes(base)) continue;
  total++;
  const host = new BufferHost(data, VIRTUAL_SOURCES);
  const out = [];
  host.print = (s) => out.push(s);
  let err = "";
  try {
    runHexpat(fs.readFileSync(path.join(dir, f), "utf8"), host, { name: f, hooks: HOOKS[base] ? HOOKS[base]() : {} });
  } catch (e) {
    // pattern errors carry a location; anything else is an interpreter bug
    err = e && e.line !== undefined ? e.message : "internal: " + (e && e.stack ? e.stack : String(e));
  }
  const ok = name.endsWith(".fail") ? err !== "" && !err.startsWith("internal:") : err === "";
  if (ok) {
    console.log("PASS " + name);
    if (xfail.has(name)) fixed.push(name);
  } else {
    failing.push(name);
    console.log((xfail.has(name) ? "XFAIL " : "FAIL ") + name);
    if (!xfail.has(name)) regressions.push(name);
    if (verbose) console.log("   " + (err || "(no error raised)") + (out.length ? "\n   " + out.join("\n   ") : ""));
  }
}
console.log("==================================");
console.log(`${total - failing.length}/${total} passed in ${Date.now() - t0}ms`);
if (update && !only.length) {
  fs.writeFileSync(xfailPath, "# upstream tests known to fail (regenerate with: make test-upstream ARGS=-u)\n" + failing.map((n) => n + "\n").join(""));
  console.log("XFAIL updated");
} else {
  if (fixed.length) console.log("now passing (remove from XFAIL): " + fixed.join(" "));
  if (regressions.length) console.log("unexpected failures: " + regressions.join(" "));
  process.exitCode = regressions.length ? 1 : 0;
}
