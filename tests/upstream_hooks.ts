/**
 * upstream_hooks.ts - what the upstream C++ test runner registers
 * (third_party/parser_cpp/tests/source/main.cpp and each test's setup()).
 */
import { HostHooks, Pattern } from "../lib/index";

/** Virtual sources registered by main.cpp for the Include / Import tests. */
export const VIRTUAL_SOURCES: Record<string, string> = {
  A: "#include <B>\n#include <C>\n\nfn a() {};\n",
  B: "#include <C>\n\nfn b() {};\n",
  C: "#pragma once\n\nfn c() {};\n",
  IA: "import IB;\nimport IC as C;\n\nfn a() {};\n",
  IB: "// auto means will be skipped if alias is set, effectively acting as a fallback\nnamespace auto B {\n\n    import IC as C;\n\n    fn b() {};\n\n}\n",
  IC: "#pragma once\n\nfn c() {};\n",
  ImportedSection: "char imported @ 0;\nstd::assert(imported == 'A', \"Imported type did not execute in the target section\");\n",
};

const pragmas = (expect: Record<string, string>) => {
  const r: Record<string, (v: string) => boolean> = {};
  for (const k in expect) r[k] = (v: string) => v === expect[k];
  return r;
};

export const HOOKS: Record<string, () => HostHooks> = {
  Pragmas: () => ({ pragmas: pragmas({ author: "authorValue", description: "descValue", somePragma: "someValue" }) }),
  PragmasIssue249: () => ({ pragmas: { once: () => true, ...pragmas({ author: "authorValue", description: "descValue", somePragma: "someValue" }) } }),
  PragmasFail: () => ({ pragmas: pragmas({ somePragma: "invalidValue" }) }),
  InVariableOverride: () => ({ inVariables: { value: 123n } }),
  CustomBuiltinType: () => ({ types: { "custom_type::custom_type": () => ({ kind: "unsigned", size: 1 }) } }),
  HeapLifetime: () => ({
    functions: {
      "test::capture_child": (args: any[]) => {
        const p = args[0];
        if (!(p instanceof Pattern) || p.entryCount() === 0) throw new Error("capture_child: no entries");
        return undefined;
      },
    },
  }),
};
