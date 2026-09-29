#!/usr/bin/env node
// Run the library over an ImHex-Patterns checkout (https://github.com/WerWolv/ImHex-Patterns):
//   1. parse every includes/**/*.pat and patterns/**/*.hexpat
//   2. evaluate every pattern that has sample data in tests/patterns/test_data,
//      like the upstream patterns_tests runner does
//
// usage: node tests/corpus.mjs [-v] [-p] <ImHex-Patterns dir> [name-filter]
//   -v  print every failure message    -p  parse only
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const verbose = argv.includes("-v");
const parseOnly = argv.includes("-p");
const [root, filter] = argv.filter((a) => !a.startsWith("-"));
if (!root) { console.error("usage: node tests/corpus.mjs [-v] [-p] <ImHex-Patterns dir> [filter]"); process.exit(2); }

// each evaluation runs in its own context so a runaway pattern can be timed out
const libSrc = fs.readFileSync(path.join(here, "testlib.js"), "utf8");
const ctx = vm.createContext({ console, Uint8Array, DataView, ArrayBuffer, BigInt, Math, JSON, Date });
vm.runInContext(libSrc, ctx);

const includes = path.join(root, "includes");
function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}
function resolver(file) {
  // like ImHex: the includes folder, the patterns folder and the pattern's own folder
  const dirs = [includes, path.join(root, "patterns"), path.dirname(file)];
  return (p, from) => {
    const bases = [path.dirname(from || file)].concat(dirs);
    for (const b of bases) for (const ext of ["", ".pat", ".hexpat"]) {
      const f = path.resolve(b, p + ext);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return { name: f, src: fs.readFileSync(f, "utf8") };
    }
    return undefined;
  };
}

ctx.__job = null;
vm.runInContext(`
  globalThis.__run = function (job) {
    const h = globalThis.hexpat;
    const data = job.data || new Uint8Array(0);
    const host = new h.BufferHost(data);
    host.print = () => undefined;
    host.resolve = job.resolve;
    const hooks = { pragmas: { MIME: () => true, description: () => true } };
    if (job.parseOnly) { h.compile(job.src, host, job.name, ["__PL_UNIT_TESTS__"]); return; }
    h.runHexpat(job.src, host, { name: job.name, hooks, defines: ["__PL_UNIT_TESTS__"] });
  };`, ctx);

function run(job, timeout) {
  ctx.__job = job;
  try {
    vm.runInContext("__run(__job)", ctx, { timeout });
    return "";
  } catch (e) {
    if (e && e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") return "timeout after " + timeout + "ms";
    return (e && e.line !== undefined ? "" : "internal: ") + (e && e.message ? e.message : String(e));
  }
}

const groups = new Map();
function record(kind, name, err) {
  // group by message without locations / names so recurring gaps stand out
  const key = kind + ": " + err.replace(/\(.*?:\d+:\d+\)/g, "").replace(/'[^']*'/g, "'…'").replace(/0x[0-9a-f]+|\d+/gi, "N").trim();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(name);
  if (verbose) console.log("FAIL " + kind + " " + name + "\n   " + err);
}

const pats = walk(includes, ".pat").concat(walk(path.join(root, "patterns"), ".hexpat")).filter((f) => !filter || f.includes(filter));
let parseOk = 0;
for (const f of pats) {
  const err = run({ src: fs.readFileSync(f, "utf8"), name: f, resolve: resolver(f), parseOnly: true }, 20000);
  if (err) record("parse", path.relative(root, f), err); else parseOk++;
}
console.log(`parse: ${parseOk}/${pats.length} files`);

if (!parseOnly) {
  const tdir = path.join(root, "tests/patterns/test_data");
  const tfiles = fs.existsSync(tdir) ? fs.readdirSync(tdir) : [];
  let evalOk = 0, evalTotal = 0;
  for (const f of walk(path.join(root, "patterns"), ".hexpat")) {
    const name = path.basename(f);
    if (filter && !f.includes(filter)) continue;
    let samples = [];
    const d = path.join(tdir, name);
    if (fs.existsSync(d) && fs.statSync(d).isDirectory()) samples = fs.readdirSync(d).map((x) => path.join(d, x));
    else { const m = tfiles.filter((x) => x.startsWith(name + ".")).sort(); if (m.length) samples = [path.join(tdir, m[0])]; }
    samples = samples.filter((x) => fs.statSync(x).isFile());
    for (const s of samples) {
      evalTotal++;
      const t0 = Date.now();
      const err = run({ src: fs.readFileSync(f, "utf8"), name: f, resolve: resolver(f), data: new Uint8Array(fs.readFileSync(s)) }, 30000);
      if (err) record("eval", name + " (" + path.basename(s) + ", " + (Date.now() - t0) + "ms)", err); else evalOk++;
    }
  }
  console.log(`eval: ${evalOk}/${evalTotal} samples`);
}

const sorted = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
for (const [k, v] of sorted) console.log(String(v.length).padStart(4) + "  " + k + "\n        " + v.slice(0, 4).join(", ") + (v.length > 4 ? ", ..." : ""));
