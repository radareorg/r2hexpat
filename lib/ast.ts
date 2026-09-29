/** ast.ts - syntax tree of the ImHex pattern language. */

export interface Loc { line: number; col: number; src: string; }

/** Byte-string character value (distinct from integers for string concat). */
export class Chr {
  constructor(public c: number, public wide = false) {}
  toString(): string { return String.fromCharCode(this.c); }
}

export type Lit = bigint | number | boolean | string | Chr | null;

/** A type application: `be Name<args...>` */
export interface TypeApp {
  name: string;
  args?: (TypeApp | Expr)[];
  endian?: "le" | "be";
  loc: Loc;
}

export type Expr = { loc: Loc } & (
  | { k: "lit"; v: Lit }
  | { k: "id"; name: string }
  | { k: "dollar" }
  | { k: "this" }
  | { k: "parent" }
  | { k: "member"; obj: Expr; name: string }
  | { k: "index"; obj: Expr; idx: Expr }
  | { k: "call"; name: string; args: Expr[]; targs?: (TypeApp | Expr)[]; endian?: "le" | "be" }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "un"; op: string; e: Expr }
  | { k: "tern"; c: Expr; a: Expr; b: Expr }
  | { k: "typeop"; op: "sizeof" | "addressof" | "typenameof"; e?: Expr; t?: TypeApp }
  | { k: "list"; items: Expr[] }
  | { k: "type"; t: TypeApp }
);

export interface Attr { name: string; args: Expr[]; }

export type ArraySpec =
  | { k: "fixed"; size: Expr }
  | { k: "while"; cond: Expr }
  | { k: "unsized" };

export interface DeclStmt {
  s: "decl";
  loc: Loc;
  type: TypeApp;
  name: string;            // "" for anonymous members (`u8;`, `padding[4];`)
  array?: ArraySpec;
  pointer?: TypeApp;       // pointer size type (`T *name : u32`)
  placement?: Expr;
  section?: Expr;
  init?: Expr;
  attrs?: Attr[];
  isConst?: boolean;
  isIn?: boolean;
  isOut?: boolean;
  bits?: Expr;             // bitfield field width
  bitSign?: "signed" | "unsigned";
}

export interface MatchCase {
  pats: MatchPat[] | null;       // null: `_` default for all subjects
  body: Stmt[];
  loc: Loc;
}
export type MatchPat = { any: true } | { any?: false; alts: { lo: Expr; hi?: Expr }[] };

export type Stmt =
  | DeclStmt
  | { s: "multi"; loc: Loc; decls: DeclStmt[] }
  | { s: "assign"; loc: Loc; target: Expr; op: string; value: Expr }
  | { s: "expr"; loc: Loc; e: Expr }
  | { s: "if"; loc: Loc; cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { s: "while"; loc: Loc; cond: Expr; body: Stmt[] }
  | { s: "for"; loc: Loc; init?: Stmt; cond: Expr; step?: Stmt; body: Stmt[] }
  | { s: "match"; loc: Loc; subjects: Expr[]; cases: MatchCase[] }
  | { s: "try"; loc: Loc; body: Stmt[]; handler: Stmt[] }
  | { s: "return"; loc: Loc; value?: Expr }
  | { s: "break"; loc: Loc }
  | { s: "continue"; loc: Loc }
  | { s: "block"; loc: Loc; body: Stmt[] }
  | { s: "nsctx"; loc: Loc; ns: string[]; body: Stmt[] }   // statements written inside a namespace
  | { s: "import"; loc: Loc; path: string; alias?: string; asType?: string }
  | TypeDecl;

export interface TParam { name: string; isValue: boolean; }

interface DeclBase { loc: Loc; name: string; ns: string[]; tparams?: TParam[]; attrs?: Attr[]; }
export interface StructDecl extends DeclBase { s: "struct" | "union"; body: Stmt[]; inherits?: TypeApp[]; }
export interface EnumDecl extends DeclBase { s: "enum"; underlying: TypeApp; entries: { name: string; value?: Expr; end?: Expr }[]; }
export interface BitfieldDecl extends DeclBase { s: "bitfield"; body: Stmt[]; }
export interface UsingDecl extends DeclBase { s: "using"; type?: TypeApp; }
export interface FnParam { name: string; type?: TypeApp; ref?: boolean; pack?: boolean; def?: Expr; }
export interface FnDecl extends DeclBase { s: "fn"; params: FnParam[]; body: Stmt[]; }
export interface ImportedDecl extends DeclBase { s: "imported"; program: Program; }

export type TypeDecl = StructDecl | EnumDecl | BitfieldDecl | UsingDecl | FnDecl | ImportedDecl;

export interface Program {
  pragmas: [string, string][];
  body: Stmt[];
}
