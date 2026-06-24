/*
Internal capability resolver — decides which platform builtins are active for a program.
Not exported from the public package barrel.
*/

import { configCommandsEnabled } from "./config/entry.ts";
import type { CliProgram } from "./types.ts";

/** Platform builtins derived from program config and runtime. */
export interface CliCapabilities {
  completion: true;
  mcp: boolean;
  install: boolean;
  docs: boolean;
  update: boolean;
  configCommands: boolean;
}

/** Resolves which capabilities are enabled for a program. */
export function resolveCapabilities(program: CliProgram): CliCapabilities {
  const install = program.install?.enabled !== false;
  return {
    completion: true,
    mcp: program.mcpServer?.enabled === true,
    install,
    docs: program.docs?.enabled === true,
    update: install && typeof program.install?.updateGetLatest === "function",
    configCommands: configCommandsEnabled(program),
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
  if (caps.configCommands) {
    names.push("config");
  }
  return names;
}

/** Commands that may run without required appConfig values (read-only / config introspection). */
export function skipsRequiredAppConfigExit(path: string[], caps: CliCapabilities): boolean {
  const root = path[0];
  if (root === "config" && caps.configCommands) {
    return true;
  }
  if (root === "docs" && caps.docs) {
    return true;
  }
  return false;
}

export type CapabilityFeature = "mcp" | "install" | "docs" | "config";

/** Stderr message when a disabled built-in is invoked from the CLI. */
export function capabilityDeniedMessage(feature: CapabilityFeature): string {
  switch (feature) {
    case "mcp":
      return "MCP is not enabled. Set mcpServer: { enabled: true } on the program root.\n";
    case "install":
      return "install is disabled. Remove install.enabled: false from the program root.\n";
    case "docs":
      return "docs is not enabled. Set docs: { enabled: true } on the program root.\n";
    case "config":
      return "config commands are disabled. Set program.appConfig or enable config.commands.\n";
  }
}

/** Exit 1 when argv[0] names a built-in that capabilities disallow. */
export function assertBuiltinAllowed(argv: string[], caps: CliCapabilities): void {
  if (argv.length < 1) {
    return;
  }
  const first = argv[0];
  if (first === "mcp" && !caps.mcp) {
    process.stderr.write(capabilityDeniedMessage("mcp"));
    process.exit(1);
  }
  if (first === "install" && !caps.install) {
    process.stderr.write(capabilityDeniedMessage("install"));
    process.exit(1);
  }
  if (first === "docs" && !caps.docs) {
    process.stderr.write(capabilityDeniedMessage("docs"));
    process.exit(1);
  }
  if (first === "config" && !caps.configCommands) {
    process.stderr.write(capabilityDeniedMessage("config"));
    process.exit(1);
  }
}
