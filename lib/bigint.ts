/**
 * bigint.ts - portable two's complement wrapping. BigInt.asUintN/asIntN are
 * broken for negative inputs in the QuickJS shipped with radare2
 * (asUintN(32, -1n) returns -1n), so they are not used anywhere.
 */

export function uintN(bits: number, v: bigint): bigint {
  const m = 1n << BigInt(bits);
  const r = v % m;
  return r < 0n ? r + m : r;
}

export function intN(bits: number, v: bigint): bigint {
  const u = uintN(bits, v);
  return u >= 1n << BigInt(bits - 1) ? u - (1n << BigInt(bits)) : u;
}
