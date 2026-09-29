/**
 * index.ts - public API of the ImHex pattern language library.
 * The library is host-agnostic: see host.ts for the interface to implement.
 */
import { parse } from "./parser";
import { PatternInstance, HostHooks } from "./evaluator";
import { HostMemory } from "./memory";
import { HexpatHost, BufferHost } from "./host";
import { PatternError } from "./lexer";
import * as A from "./ast";

export { parse, PatternInstance, PatternError, BufferHost };
export type { HexpatHost, HostHooks };
export { Pattern } from "./patterns";
export { toJson, patternToJson, walkPatterns, jsonValue } from "./output";
export type { PatternJson, JsonOptions } from "./output";

export interface RunOptions {
  name?: string;       // source name for error messages and relative includes
  hooks?: HostHooks;   // extra functions, types, pragma handlers, in-variables
}

/** Parse a pattern source (resolving #include / import through the host). */
export function compile(src: string, host?: HexpatHost, name = "<source>"): A.Program {
  return parse(src, name, host && host.resolve ? (p, from) => host.resolve!(p, from) : undefined);
}

/** Evaluate a parsed program against the host data. */
export function evaluate(program: A.Program, host: HexpatHost, hooks?: HostHooks): PatternInstance {
  const inst = new PatternInstance(program, new HostMemory(host), hooks, host.print ? (s) => host.print!(s) : undefined);
  inst.eval();
  return inst;
}

/** Parse and evaluate a hexpat source. Synchronous. */
export function runHexpat(src: string, host: HexpatHost, opts: RunOptions = {}): PatternInstance {
  return evaluate(compile(src, host, opts.name), host, opts.hooks);
}

/** Value of a pragma (last one wins), e.g. pragma(program, "base_address"). */
export function pragma(program: A.Program, key: string): string | undefined {
  let v: string | undefined;
  for (const [k, val] of program.pragmas) if (k === key) v = val;
  return v;
}
