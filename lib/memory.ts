/**
 * memory.ts - byte-addressable memory used by the pattern runtime:
 * the host data source (paged cache), std::mem sections and the heap.
 */
import { HexpatHost } from "./host";

export interface Memory {
  read(addr: number, size: number): Uint8Array;
  write?(addr: number, bytes: Uint8Array): void;
  size(): number;
}

const PAGE = 4096;

/** Read-only view of the host data with a page cache. */
export class HostMemory implements Memory {
  private pages = new Map<number, Uint8Array>();
  private _size = -1;
  constructor(private host: HexpatHost) {}
  size(): number {
    if (this._size < 0) this._size = Math.max(0, this.host.size());
    return this._size;
  }
  private page(n: number): Uint8Array {
    let p = this.pages.get(n);
    if (!p) {
      p = new Uint8Array(PAGE);
      const len = Math.min(PAGE, this.size() - n * PAGE);
      if (len > 0) p.set(this.host.read(n * PAGE, len).subarray(0, len));
      this.pages.set(n, p);
    }
    return p;
  }
  read(addr: number, size: number): Uint8Array {
    const out = new Uint8Array(Math.max(0, size));
    for (let done = 0; done < size;) {
      const a = addr + done, pn = Math.floor(a / PAGE), po = a - pn * PAGE;
      const n = Math.min(PAGE - po, size - done);
      out.set(this.page(pn).subarray(po, po + n), done);
      done += n;
    }
    return out;
  }
}

/** Growable, writable byte buffer (std::mem sections). */
export class BufferMemory implements Memory {
  data = new Uint8Array(0);
  len = 0;
  constructor(public name = "") {}
  size(): number { return this.len; }
  resize(n: number): void {
    if (n > this.data.length) {
      const d = new Uint8Array(Math.max(n, this.data.length * 2, 64));
      d.set(this.data.subarray(0, this.len));
      this.data = d;
    }
    if (n < this.len) this.data.fill(0, n, this.len);
    this.len = n;
  }
  read(addr: number, size: number): Uint8Array {
    const out = new Uint8Array(Math.max(0, size));
    if (addr < this.len) out.set(this.data.subarray(addr, Math.min(this.len, addr + size)));
    return out;
  }
  write(addr: number, bytes: Uint8Array): void {
    if (addr + bytes.length > this.len) this.resize(addr + bytes.length);
    this.data.set(bytes, addr);
  }
}

/** Sparse zero-initialized memory used as heap for local variables. */
export class SparseMemory implements Memory {
  private pages = new Map<number, Uint8Array>();
  top = 0;
  size(): number { return this.top; }
  alloc(n: number): number { const a = this.top; this.top += Math.max(1, n); return a; }
  read(addr: number, size: number): Uint8Array {
    const out = new Uint8Array(Math.max(0, size));
    for (let done = 0; done < size;) {
      const a = addr + done, pn = Math.floor(a / PAGE), po = a - pn * PAGE;
      const n = Math.min(PAGE - po, size - done);
      const p = this.pages.get(pn);
      if (p) out.set(p.subarray(po, po + n), done);
      done += n;
    }
    return out;
  }
  write(addr: number, bytes: Uint8Array): void {
    for (let done = 0; done < bytes.length;) {
      const a = addr + done, pn = Math.floor(a / PAGE), po = a - pn * PAGE;
      const n = Math.min(PAGE - po, bytes.length - done);
      let p = this.pages.get(pn);
      if (!p) { p = new Uint8Array(PAGE); this.pages.set(pn, p); }
      p.set(bytes.subarray(done, done + n), po);
      done += n;
    }
    if (addr + bytes.length > this.top) this.top = addr + bytes.length;
  }
}
