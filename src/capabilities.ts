/*
Internal capability resolver — decides which platform builtins are active for a program.
Not exported from the public package barrel.
*/

import { configCommandsEnabled } from "./config/entry.ts";
import type { CliProgram } from "./types.ts";

/** Platform builtins derived from program config and runtime. */
export interface CliCapabilities {
  completion: boolean;
  mcp: boolean;
  configure: boolean;
  docs: boolean;
  configCommands: boolean;
}

/** Resolves which capabilities are enabled for a program. */
export function resolveCapabilities(program: CliProgram): CliCapabilities {
  const configure = program.configure?.enabled !== false;
  return {
    completion: program.completion?.enabled !== false,
    mcp: program.mcpServer?.enabled === true,
    configure,
    docs: program.docs?.enabled === true,
    configCommands: configCommandsEnabled(program),
  };
}

/** Reserved top-level command names for the given capabilities. */
export function reservedCommandNames(caps: CliCapabilities): string[] {
  const names = ["version"];
  if (caps.completion) {
    names.unshift("completion");
  }
  if (caps.configure) {
    names.push("configure");
  }
  if (caps.docs) {
    names.push("docs");
  }
  if (caps.mcp) {
    names.push("mcp");
  }
  return names;
}

/** Commands that may run without required appConfig values (read-only / config introspection). */
export function skipsRequiredAppConfigExit(path: string[], caps: CliCapabilities): boolean {
  const root = path[0];
  if (root === "configure" && caps.configCommands) {
    const sub = path[1];
    if (sub === "get" || sub === "set") {
      return true;
    }
  }
  if (root === "docs" && caps.docs) {
    return true;
  }
  return false;
}

export type CapabilityFeature = "mcp" | "configure" | "docs" | "completion";

/** Stderr message when a disabled built-in is invoked from the CLI. */
export function capabilityDeniedMessage(feature: CapabilityFeature): string {
  switch (feature) {
    case "completion":
      return "Shell completion is not available for this app.\n";
    case "mcp":
      return "MCP is not available for this app.\n";
    case "configure":
      return "Configure is not available for this app.\n";
    case "docs":
      return "Documentation commands are not available for this app.\n";
  }
}

/** Exit 1 when argv[0] names a built-in that capabilities disallow. */
export function assertBuiltinAllowed(argv: string[], caps: CliCapabilities): void {
  if (argv.length < 1) {
    return;
  }
  const first = argv[0];
  if (first === "completion" && !caps.completion) {
    process.stderr.write(capabilityDeniedMessage("completion"));
    process.exit(1);
  }
  if (first === "mcp" && !caps.mcp) {
    process.stderr.write(capabilityDeniedMessage("mcp"));
    process.exit(1);
  }
  if (first === "configure" && !caps.configure) {
    process.stderr.write(capabilityDeniedMessage("configure"));
    process.exit(1);
  }
  if (first === "docs" && !caps.docs) {
    process.stderr.write(capabilityDeniedMessage("docs"));
    process.exit(1);
  }
}
