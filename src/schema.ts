/*
This module serializes the CLI schema tree to JSON for machine-readable introspection.
*/

import { CliCommand } from "./types.ts";
import { exportPresentationBuiltins, type CliSchemaExport } from "./builtins/export.ts";

const RESERVED = new Set(["completion", "install", "mcp"]);

function exportCommand(cmd: CliCommand): CliSchemaExport {
  const out: CliSchemaExport = {
    key: cmd.key,
    description: cmd.description,
  };

  if ((cmd.notes ?? "").length > 0) {
    out.notes = cmd.notes;
  }

  if ((cmd.options ?? []).length > 0) {
    out.options = cmd.options;
  }

  if ("handler" in cmd && cmd.handler) {
    if ((cmd.positionals ?? []).length > 0) {
      out.positionals = cmd.positionals;
    }
    out.commands = exportPresentationBuiltins(cmd);
    return out;
  }

  if (cmd.fallbackCommand !== undefined) {
    out.fallbackCommand = cmd.fallbackCommand;
  }
  if (cmd.fallbackMode !== undefined) {
    out.fallbackMode = cmd.fallbackMode;
  }

  const children = (cmd.commands ?? []).filter((ch) => !RESERVED.has(ch.key));
  if (children.length > 0) {
    out.commands = children.map(exportCommand);
  }

  return out;
}

export function cliSchemaJson(root: CliCommand): string {
  return JSON.stringify(exportCommand(root), null, 2) + "\n";
}

export type { CliSchemaExport };
