/*
This module serializes the CLI schema tree to JSON for machine-readable introspection.
*/

import { type CliSchemaExport, exportPresentationBuiltins } from "./builtins/export.ts";
import { cliResolveNotes } from "./help.ts";
import { visibleOptions } from "./hidden.ts";
import {
  type CliNode,
  type CliProgram,
  isCliLeaf,
  isCliRouter,
  leafOutputSchema,
} from "./types.ts";

const RESERVED = new Set(["completion", "install", "docs", "mcp", "version"]);

function exportCommand(cmd: CliNode, root: CliProgram): CliSchemaExport | null {
  if (cmd.hidden) {
    return null;
  }

  const out: CliSchemaExport = {
    key: cmd.key,
    description: cmd.description,
  };

  if ((cmd.notes ?? "").length > 0) {
    out.notes = cmd.notes;
  }

  const options = visibleOptions(cmd.options);
  if (options.length > 0) {
    out.options = options;
  }

  if (isCliLeaf(cmd)) {
    if ((cmd.positionals ?? []).length > 0) {
      out.positionals = cmd.positionals;
    }
    const outputSchema = leafOutputSchema(cmd);
    if (outputSchema !== undefined) {
      out.outputSchema = outputSchema;
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
    out.commands = children
      .map((ch) => exportCommand(ch, root))
      .filter((ch): ch is CliSchemaExport => ch !== null);
  }

  return out;
}

/** Resolves `{argsbarg:program}` in exported notes using the root program key. */
function resolveSchemaNotes(node: CliSchemaExport, appKey: string): CliSchemaExport {
  const out: CliSchemaExport = { ...node };
  if ((out.notes ?? "").length > 0 && out.notes !== undefined) {
    out.notes = cliResolveNotes(out.notes, appKey);
  }
  if (out.commands) {
    out.commands = out.commands.map((ch) => resolveSchemaNotes(ch, appKey));
  }
  return out;
}

/** Returns the JSON-safe command tree (handlers omitted). */
export function cliSchemaExport(root: CliProgram): CliSchemaExport {
  const exported = exportCommand(root, root);
  if (!exported) {
    return {
      key: root.key,
      description: root.description,
      commands: exportPresentationBuiltins(root),
    };
  }
  return resolveSchemaNotes(exported, root.key);
}

export function cliSchemaJson(root: CliProgram): string {
  return `${JSON.stringify(cliSchemaExport(root), null, 2)}\n`;
}

export type { CliSchemaExport };
