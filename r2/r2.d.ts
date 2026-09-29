/// <reference path="../lib/globals.d.ts" />
declare global {
  interface R2JsBridge {
    cmd(cmd: string): string;
    log(msg: string): void;
    cmdj(cmd: string): any;
    call(cmd: string): string;
    plugin(type: string, r2plugin: any): void;
    unload(type: string, name: string): void;
  }
  var r2: R2JsBridge;
}
export {};
