/*
This module serializes the CLI schema tree to JSON for machine-readable introspection.
*/

import { exportPresentationBuiltins, type SchemaExport } from "../builtins/export.ts";
import { cliResolveNotes } from "../help.ts";
import { isCliSchemaHidden, visibleOptions } from "../runtime/exposure.ts";
import { type AppSpec, type Command, hasHandler, hasSubcommands, leafOutputSchema } from "./types.ts";
import { buildCommandInputSchema } from "./wire-schema.ts";
import { toJsonSchema } from "./zod-schema.ts";

const RESERVED = new Set(["http", "completion", "configure", "docs", "mcp", "version"]);

function exportCommand(cmd: Command, root: AppSpec): SchemaExport | null {
  if (isCliSchemaHidden(cmd)) {
    return null;
  }

  const out: SchemaExport = {
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

  if (hasHandler(cmd)) {
    if ((cmd.positionals ?? []).length > 0) {
      out.positionals = cmd.positionals;
    }
    out.inputSchema = buildCommandInputSchema(cmd);
    const outputSchema = leafOutputSchema(cmd);
    if (outputSchema !== undefined) {
      out.outputSchema = outputSchema;
    } else if (cmd.http?.successContentType !== undefined) {
      out.outputContentType = cmd.http.successContentType;
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

  const children = hasSubcommands(cmd) ? cmd.commands.filter((ch) => !RESERVED.has(ch.key)) : [];
  if (children.length > 0) {
    out.commands = children.map((ch) => exportCommand(ch, root)).filter((ch): ch is SchemaExport => ch !== null);
  }

  return out;
}

/** Resolves `{argsbarg:program}` in exported notes using the root program key. */
function resolveSchemaNotes(node: SchemaExport, appKey: string): SchemaExport {
  const out: SchemaExport = { ...node };
  if ((out.notes ?? "").length > 0 && out.notes !== undefined) {
    out.notes = cliResolveNotes(out.notes, appKey);
  }
  if (out.commands) {
    out.commands = out.commands.map((ch) => resolveSchemaNotes(ch, appKey));
  }
  return out;
}

/** JSON-safe command tree export (handlers omitted). */
export interface SchemaRootExport extends SchemaExport {
  /** App-level error JSON Schema when configured on `httpServer.errors` or `mcpServer.errors`. */
  errorSchema?: Record<string, unknown>;
}

/** Returns the JSON-safe command tree (handlers omitted). */
export function schemaExport(root: AppSpec): SchemaRootExport {
  const exported = exportCommand(root, root);
  const errorSchema = root.httpServer?.errors?.errorSchema ?? root.mcpServer?.errors?.errorSchema;
  const base: SchemaRootExport = !exported
    ? {
        key: root.key,
        description: root.description,
        commands: exportPresentationBuiltins(root),
      }
    : resolveSchemaNotes(exported, root.key);
  if (errorSchema !== undefined) {
    base.errorSchema = toJsonSchema(errorSchema, "output");
  }
  return base;
}

export function schemaJson(root: AppSpec): string {
  return `${JSON.stringify(schemaExport(root), null, 2)}\n`;
}

export type { SchemaExport };
