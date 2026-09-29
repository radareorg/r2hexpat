/// <reference path="../lib/globals.d.ts" />
import { runHexpat, BufferHost } from "../lib/index";

const src = `
struct Header {
    u32 magic;
    u32 version;
};
Header header @ 0x0;
u32 checksum @ 0x8;
`;

// fake binary: ELF magic, version, checksum
const data = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x02, 0x00, 0x00, 0xaa, 0xbb, 0xcc, 0xdd]);

console.log("[test] running pipeline...");
const inst = runHexpat(src, new BufferHost(data));
inst.dump();

const header = inst.get("header");
if (!header || !header.children) throw new Error("header pattern missing!");
const magic = inst.value(header.children[0]);
console.log("[test] magic value: " + magic + " expected 1179403647 (0x464c457f)");
if (magic !== 0x464c457fn) throw new Error("magic mismatch!");
console.log("[test] OK");

// JSON serialization
import { toJson } from "../lib/index";
const js = JSON.stringify(toJson(inst, { base: 0x1000 }));
console.log("[test] json: " + js);
const parsed = JSON.parse(js);
if (parsed[0].name !== "header" || parsed[0].addr !== 0x1000 || parsed[0].children[0].value !== 0x464c457f) throw new Error("json mismatch!");
if (parsed[1].name !== "checksum" || parsed[1].value !== 0xddccbbaa) throw new Error("json checksum mismatch!");
console.log("[test] JSON OK");
