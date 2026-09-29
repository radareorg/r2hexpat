import * as A from "./ast";
export class Interpreter {
  evalExpr(expr: A.Expr, scope: Map<string, any>): any {
    switch (expr.kind) {
      case 'num': return expr.value;
      case 'ident': return scope.get(expr.name);
      case 'binary':
        const l = this.evalExpr(expr.lhs, scope);
        const r = this.evalExpr(expr.rhs, scope);
        if (expr.op === '+') return l + r;
        if (expr.op === '-') return l - r;
        return 0;
      default: return 0;
    }
  }
}
