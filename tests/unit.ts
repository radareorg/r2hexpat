/// <reference path="../lib/hexpat.d.ts" />
import { runHexpat } from "../lib/index";

const src = `
struct Header {
    u32 magic;
    u32 version;
};
Header header @ 0x0;
u32 checksum @ 0x8;
`;

// fake binary: ELF magic, version, checksum
const mockBuffer = [0x7f,0x45,0x4c,0x46, 0x01,0x02,0x00,0x00, 0xaa,0xbb,0xcc,0xdd];
const mockR2 = {
  cmd: function (c: string): string {
    const m = c.match(/^p8 (\d+) @ (\d+)$/);
    if (m) {
      const size = parseInt(m[1], 10);
      const addr = parseInt(m[2], 10);
      let s = "";
      for (let i = 0; i < size; i++) {
        const b = mockBuffer[addr + i];
        s += (b === undefined ? "00" : b.toString(16).padStart(2, "0"));
      }
      return s;
    }
    return "";
  }
};

console.log("[test] running pipeline...");
const inst = runHexpat(src, mockR2);
inst.dump();

const header = inst.get("header");
if (!header) throw new Error("header pattern missing!");
const magic = header && header.children ? header.children[0] : undefined;
console.log("[test] magic value: " + (magic ? magic.value : "?") + " expected 1179403647 (0x464c457f)");
if (!magic || magic.value !== 0x464c457f) throw new Error("magic mismatch!");
console.log("[test] OK");
