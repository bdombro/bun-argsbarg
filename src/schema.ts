/*
This module serializes the CLI schema tree to JSON for machine-readable introspection.
It strips handlers and runtime-only nodes so agents can discover commands, options,
and positionals in one shot.

It keeps schema export aligned with the declarative CliCommand model that drives help
and completion.
*/

import {
  CliCommand,
  CliFallbackMode,
  CliOption,
  CliPositional,
} from "./types.ts";

/** JSON-safe command node (no handlers). */
export interface CliSchemaExport {
  /** Program or command key. */
  key: string;
  /** Short description shown in help. */
  description: string;
  /** Additional notes shown in help (supports {app} placeholder). */
  notes?: string;
  /** Global or command-level flags/options. */
  options?: CliOption[];
  /** Default top-level subcommand (program root only). */
  fallbackCommand?: string;
  /** How fallbackCommand is applied (program root only). */
  fallbackMode?: CliFallbackMode;
  /** Nested subcommands (routing nodes only). */
  commands?: CliSchemaExport[];
  /** Positional argument definitions (leaf nodes only). */
  positionals?: CliPositional[];
}

/** Converts one `CliCommand` node into a JSON-safe export (handlers omitted). */
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
    return out;
  }

  if (cmd.fallbackCommand !== undefined) {
    out.fallbackCommand = cmd.fallbackCommand;
  }
  if (cmd.fallbackMode !== undefined) {
    out.fallbackMode = cmd.fallbackMode;
  }

  const children = (cmd.commands ?? []).filter((ch) => ch.key !== "completion");
  if (children.length > 0) {
    out.commands = children.map(exportCommand);
  }

  return out;
}

/** Returns pretty-printed JSON for the full program schema (trailing newline). */
export function cliSchemaJson(root: CliCommand): string {
  return JSON.stringify(exportCommand(root), null, 2) + "\n";
}
