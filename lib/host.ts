/**
 * host.ts - the interface a program embedding the pattern runtime implements.
 * The library never talks to radare2 (or the filesystem) directly: memory
 * reads, output and include/import resolution all go through a host.
 */

export interface HexpatSource { name: string; src: string; }

export interface HexpatHost {
  /** Size in bytes of the data being analyzed (pattern address space). */
  size(): number;
  /** Read `size` bytes at pattern address `addr` (short reads are zero-padded). */
  read(addr: number, size: number): Uint8Array;
  /** Output of std::print and friends (defaults to console.log). */
  print?(msg: string): void;
  /** Resolve an `#include` / `import` path relative to the including source. */
  resolve?(path: string, from: string): HexpatSource | undefined;
}

/** Host backed by an in-memory buffer (tests, embedding). */
export class BufferHost implements HexpatHost {
  print?: (msg: string) => void;
  constructor(public data: Uint8Array, private sources: Record<string, string> = {}) {}
  size(): number { return this.data.length; }
  read(addr: number, size: number): Uint8Array {
    const out = new Uint8Array(size);
    if (addr < this.data.length) out.set(this.data.subarray(addr, Math.min(this.data.length, addr + size)));
    return out;
  }
  resolve(path: string): HexpatSource | undefined {
    for (const n of [path, path + ".hexpat", path + ".pat"]) if (n in this.sources) return { name: n, src: this.sources[n] };
    return undefined;
  }
}
