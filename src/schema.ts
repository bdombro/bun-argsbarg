/*
This module serializes the CLI schema tree to JSON for machine-readable introspection.
*/

import { type CliNode, type CliProgram, isCliLeaf, isCliRouter } from "./types.ts";
import { exportPresentationBuiltins, type CliSchemaExport } from "./builtins/export.ts";
import { cliResolveNotes } from "./help.ts";

const RESERVED = new Set(["completion", "install", "docs", "mcp", "version"]);

function exportCommand(cmd: CliNode, root: CliProgram): CliSchemaExport {
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
    out.commands = exportPresentationBuiltins(root);
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
    out.commands = children.map((ch) => exportCommand(ch, root));
  }

  return out;
}

/** Resolves `{argsbarg:program}` in exported notes using the root program key. */
function resolveSchemaNotes(node: CliSchemaExport, appKey: string): CliSchemaExport {
  const out: CliSchemaExport = { ...node };
  if ((out.notes ?? "").length > 0) {
    out.notes = cliResolveNotes(out.notes!, appKey);
  }
  if (out.commands) {
    out.commands = out.commands.map((ch) => resolveSchemaNotes(ch, appKey));
  }
  return out;
}

/** Returns the JSON-safe command tree (handlers omitted). */
export function cliSchemaExport(root: CliProgram): CliSchemaExport {
  return resolveSchemaNotes(exportCommand(root, root), root.key);
}

export function cliSchemaJson(root: CliProgram): string {
  return JSON.stringify(cliSchemaExport(root), null, 2) + "\n";
}

export type { CliSchemaExport };
