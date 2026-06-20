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
}

/** Resolves which capabilities are enabled for a program. */
export function resolveCapabilities(program: CliProgram): CliCapabilities {
  return {
    completion: true,
    mcp: program.mcpServer !== undefined,
    install: program.install?.enabled !== false,
  };
}

/** Reserved top-level command names for the given capabilities. */
export function reservedCommandNames(caps: CliCapabilities): string[] {
  const names = ["completion"];
  if (caps.install) {
    names.push("install");
  }
  if (caps.mcp) {
    names.push("mcp");
  }
  return names;
}
