/// <reference path="../lib/globals.d.ts" />
// Bundle entry for the node test runners: exposes the library and the
// upstream harness hooks as `globalThis.hexpat` (no node APIs used here).
import * as hexpat from "../lib/index";
import { VIRTUAL_SOURCES, HOOKS } from "./upstream_hooks";

(globalThis as any).hexpat = { ...hexpat, VIRTUAL_SOURCES, HOOKS };
