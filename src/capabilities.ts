/*
Internal capability resolver — decides which platform builtins are active for a program.
Not exported from the public package barrel.
*/

import type { CliProgram } from "./types.ts";

/** Platform builtins derived from program config and runtime. */
export interface CliCapabilities {
  completion: true;
  mcp: boolean;
  install: boolean;
  docs: boolean;
}

/** Resolves which capabilities are enabled for a program. */
export function resolveCapabilities(program: CliProgram): CliCapabilities {
  return {
    completion: true,
    mcp: program.mcpServer?.enabled === true,
    install: program.install?.enabled !== false,
    docs: program.docs?.enabled === true,
  };
}

/** Reserved top-level command names for the given capabilities. */
export function reservedCommandNames(caps: CliCapabilities): string[] {
  const names = ["completion", "version"];
  if (caps.install) {
    names.push("install");
  }
  if (caps.docs) {
    names.push("docs");
  }
  if (caps.mcp) {
    names.push("mcp");
  }
  return names;
}
