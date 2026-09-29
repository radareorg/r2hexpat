// Minimal runtime globals shared by every host (QuickJS in r2, node, browsers).
declare global {
  var console: { log(...a: any[]): void; error(...a: any[]): void };
}
export {};
