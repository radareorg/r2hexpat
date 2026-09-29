declare global {
  interface R2JsBridge {
    cmd(cmd: string): string;
    cmdj(cmd: string): any;
    cmdAt(cmd: string, addr: number): string;
    cmd0(cmd: string): number;
    call(cmd: string): string;
    callAt(cmd: string, addr: number): string;
    plugin(type: string, r2plugin: any): void;
  }
  var r2: R2JsBridge;
}
export {};
