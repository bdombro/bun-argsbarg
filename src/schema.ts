/*
This module serializes the CLI schema tree to JSON for machine-readable introspection.
*/

import { type CliNode, type CliProgram, isCliLeaf, isCliRouter } from "./types.ts";
import { exportPresentationBuiltins, type CliSchemaExport } from "./builtins/export.ts";

const RESERVED = new Set(["completion", "install", "mcp"]);

function exportCommand(cmd: CliNode): CliSchemaExport {
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

  if (isCliLeaf(cmd)) {
    if ((cmd.positionals ?? []).length > 0) {
      out.positionals = cmd.positionals;
    }
    out.commands = exportPresentationBuiltins(cmd as CliProgram);
    return out;
  }

  if (cmd.fallbackCommand !== undefined) {
    out.fallbackCommand = cmd.fallbackCommand;
  }
  if (cmd.fallbackMode !== undefined) {
    out.fallbackMode = cmd.fallbackMode;
  }

  const children = isCliRouter(cmd) ? cmd.commands.filter((ch) => !RESERVED.has(ch.key)) : [];
  if (children.length > 0) {
    out.commands = children.map(exportCommand);
  }

  return out;
}

export function cliSchemaJson(root: CliProgram): string {
  return JSON.stringify(exportCommand(root), null, 2) + "\n";
}

export type { CliSchemaExport };
