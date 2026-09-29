/**
 * r2pipe.ts - Memory access bridge over the r2js API.
 * Reads are done with `p8 <size> @ <addr>` which prints raw hex pairs.
 */
export class R2Pipe {
  baseAddress = 0; // pattern-space to r2 address translation
  bigEndianDefault = false;
  private _fileSize = -1;
  constructor(private r2: any) {}

  /** Load size in pattern space (ij.core.size minus base). */
  fileSize(): number {
    if (this._fileSize < 0) {
      try {
        const ij = JSON.parse(this.r2.cmd("ij"));
        this._fileSize = Math.max(0, (ij?.core?.size ?? 0) - this.baseAddress);
      } catch (e) { this._fileSize = 0; }
    }
    return this._fileSize;
  }

  /** Read raw bytes at address. Returns array of byte values. */
  readBytes(addr: number, size: number): number[] {
    if (size <= 0) return [];
    let hex = "";
    try {
      hex = this.r2.cmd("p8 " + size + " @ " + (this.baseAddress + addr));
    } catch (e) {
      return [];
    }
    if (!hex) return [];
    // p8 output: hex pairs possibly separated by spaces/newlines; strip 0x just in case
    const clean = hex.replace(/0x/g, "").replace(/[\s,]/g, "");
    const bytes: number[] = [];
    for (let i = 0; i + 1 < clean.length && bytes.length < size; i += 2) {
      const b = parseInt(clean.substr(i, 2), 16);
      if (isNaN(b)) break;
      bytes.push(b);
    }
    return bytes;
  }

  /** Read unsigned integer of given byte size honoring endianness.
   *  64/128-bit reads use BigInt to avoid double precision loss. */
  readUnsigned(addr: number, size: number, bigEndian?: boolean): number | bigint {
    const be = bigEndian ?? this.bigEndianDefault;
    const bytes = this.readBytes(addr, size);
    if (bytes.length < size) return NaN;
    if (size <= 6) {
      let v = 0;
      if (be) { for (let i = 0; i < size; i++) v = v * 256 + bytes[i]; }
      else { for (let i = size - 1; i >= 0; i--) v = v * 256 + bytes[i]; }
      return v;
    }
    // big sizes: exact via BigInt
    let b = 0n;
    if (be) { for (let i = 0; i < size; i++) b = b * 256n + BigInt(bytes[i]); }
    else { for (let i = size - 1; i >= 0; i--) b = b * 256n + BigInt(bytes[i]); }
    return b;
  }

  readSigned(addr: number, size: number, bigEndian?: boolean): number | bigint {
    const be = bigEndian ?? this.bigEndianDefault;
    let v = this.readUnsigned(addr, size, be);
    const bits = BigInt(size * 8);
    if (typeof v === 'bigint') {
      if (v >= (1n << (bits - 1n))) v -= (1n << bits);
      return v;
    }
    if (v >= Math.pow(2, Number(bits) - 1)) v -= Math.pow(2, Number(bits));
    return v;
  }

  readFloat(addr: number, size: number, bigEndian?: boolean): number {
    const be = bigEndian ?? this.bigEndianDefault;
    const bytes = this.readBytes(addr, size);
    if (bytes.length < size) return NaN;
    const buf = new ArrayBuffer(size);
    const u8 = new Uint8Array(buf);
    if (be) { for (let i = 0; i < size; i++) u8[i] = bytes[i]; }
    else { for (let i = 0; i < size; i++) u8[size - 1 - i] = bytes[i]; }
    const dv = new DataView(buf);
    return size === 4 ? dv.getFloat32(0, false) : dv.getFloat64(0, false);
  }

  /** Read a null-terminated string starting at addr. */
  readStringZ(addr: number, maxLen = 4096): string {
    let s = "";
    for (let i = 0; i < maxLen; i++) {
      const b = this.readBytes(addr + i, 1);
      if (b.length === 0 || b[0] === 0) break;
      s += String.fromCharCode(b[0]);
    }
    return s;
  }

  /** Push a C type definition into r2's type database (td). */
  pushType(cdecl: string) {
    try { this.r2.cmd('td "' + cdecl + '"'); } catch (e) { /* ignore */ }
  }

  /** Link a type name to an address (tl). */
  linkType(name: string, addr: number) {
    try { this.r2.cmd("tl " + name + " @ " + addr); } catch (e) { /* ignore */ }
  }
}
