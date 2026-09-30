/*
Internal capability resolver — decides which platform builtins are active for a program.
Not exported from the public package barrel.
*/

import { type AppSpec, hasSubcommands } from "../core/types.ts";

/** Platform builtins derived from program config and runtime. */
export interface Capabilities {
  http: boolean;
  completion: boolean;
  mcp: boolean;
}

/** Resolves which capabilities are enabled for a program. */
export function resolveCapabilities(program: AppSpec): Capabilities {
  return {
    http: program.httpServer?.enabled === true,
    completion: program.completion?.enabled !== false,
    mcp: program.mcpServer?.enabled === true,
  };
}

/** Reserved top-level command names for the given capabilities. */
export function reservedCommandNames(caps: Capabilities): string[] {
  const names = ["version"];
  if (caps.completion) {
    names.unshift("completion");
  }
  if (caps.mcp) {
    names.push("mcp");
  }
  if (caps.http) {
    names.push("http");
  }
  return names;
}

export type CapabilityFeature = "http" | "mcp" | "completion";

/** Stderr message when a disabled built-in is invoked from the CLI. */
export function capabilityDeniedMessage(feature: CapabilityFeature): string {
  switch (feature) {
    case "completion":
      return "Shell completion is not available for this app.\n";
    case "http":
      return "HTTP API is not available for this app.\n";
    case "mcp":
      return "MCP is not available for this app.\n";
  }
}

/**
 * Exit 1 when argv[0] names a built-in that capabilities disallow — unless the app declares its own
 * root command with that key (the name is only reserved while the capability is on).
 */
export function assertBuiltinAllowed(
  /** Raw argv after the program name. */
  argv: string[],
  /** Capabilities resolved from the app spec. */
  caps: Capabilities,
  /** The app spec, to find the app's own root command keys. */
  program: AppSpec,
): void {
  if (argv.length < 1) {
    return;
  }
  const first = argv[0];
  if (hasSubcommands(program) && program.commands.some((c) => c.key === first)) {
    return;
  }
  if (first === "completion" && !caps.completion) {
    process.stderr.write(capabilityDeniedMessage("completion"));
    process.exit(1);
  }
  if (first === "mcp" && !caps.mcp) {
    process.stderr.write(capabilityDeniedMessage("mcp"));
    process.exit(1);
  }
  if (first === "http" && !caps.http) {
    process.stderr.write(capabilityDeniedMessage("http"));
    process.exit(1);
  }
}
