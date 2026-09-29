export type Expr =
  | { kind: 'num', value: number }
  | { kind: 'str', value: string }
  | { kind: 'char', value: string }
  | { kind: 'bool', value: boolean }
  | { kind: 'null' }
  | { kind: 'ident', name: string }
  | { kind: 'member', obj: Expr, name: string }
  | { kind: 'index', obj: Expr, idx: Expr }
  | { kind: 'call', name: string, args: Expr[] }
  | { kind: 'binary', op: string, lhs: Expr, rhs: Expr }
  | { kind: 'unary', op: string, operand: Expr }
  | { kind: 'ternary', cond: Expr, a: Expr, b: Expr }
  | { kind: 'sizeof', operand: Expr }
  | { kind: 'addressof', operand: Expr }
  | { kind: 'typenameof', operand: Expr }
  | { kind: 'this' }
  | { kind: 'parent' }
  | { kind: 'curpos' }
  | { kind: 'cast', type: TypeRef, operand: Expr };

export interface TypeRef {
  name: string;
  endian?: 'le' | 'be' | 'native';
  const?: boolean;
  pointerDepth?: number;
  pointerBase?: TypeRef;
  templateArgs?: (TypeRef | Expr)[];
}

export type Stmt =
  | { kind: 'place', type: TypeRef, name: string, attributes?: Attribute[], placement?: Expr, arraySize?: Expr, whileCond?: Expr }
  | { kind: 'if', cond: Expr, then: Stmt[], else?: Stmt[] }
  | { kind: 'while', cond: Expr, body: Stmt[] }
  | { kind: 'for', init: Stmt, cond: Expr, update: Stmt, body: Stmt[] }
  | { kind: 'match', subject: Expr, cases: { patterns: any[], body: Stmt[] }[] }
  | { kind: 'vardecl', name: string, value: Expr }
  | { kind: 'return', value?: Expr }
  | { kind: 'break' }
  | { kind: 'continue' }
  | { kind: 'callstmt', name: string, args: Expr[] }
  | { kind: 'block', body: Stmt[] };

export interface Attribute { name: string; args: (string | number)[]; }

export interface StructDecl { kind: 'struct'; name: string; body: Stmt[]; attributes?: Attribute[]; templateParams?: string[]; }
export interface UnionDecl { kind: 'union'; name: string; body: Stmt[]; attributes?: Attribute[]; }
export interface EnumDecl { kind: 'enum'; name: string; underlying?: TypeRef; cases: { name: string; value?: Expr }[]; attributes?: Attribute[]; }
export interface BitfieldDecl { kind: 'bitfield'; name: string; fields: { name: string; size: Expr }[]; attributes?: Attribute[]; }
export interface UsingDecl { kind: 'using'; name: string; type: TypeRef; templateParams?: string[]; }
export interface FnDecl { kind: 'fn'; name: string; params: { name: string; type?: TypeRef }[]; body: Stmt[]; }

export type TypeDecl = StructDecl | UnionDecl | EnumDecl | BitfieldDecl | UsingDecl | FnDecl;

export interface Program {
  pragmas: Record<string, string>;
  types: TypeDecl[];
  statements: Stmt[];
}
