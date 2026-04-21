/*
This module defines the CLI schema, option kinds, fallback modes, and helpers.
It is the shared declarative model that parsing, validation, help, and completion all
read from, so the package has one source of truth.

It gives the package one shared model for both library users and internal modules.
*/

import type { CliContext } from "./context.ts";

/**
 * Option kinds: presence (boolean flag), string (free-form text), or number (strict double).
 */
export enum CliOptionKind {
  Presence = "presence",
  String = "string",
  Number = "number",
}

/**
 * When fallbackCommand is used for missing or unknown top-level tokens.
 * Only the program root may set a non-default mode or a non-nil fallbackCommand.
 */
export enum CliFallbackMode {
  /** Use the fallback only when argv has no first subcommand token. */
  MissingOnly = "missingOnly",
  /** Use the fallback when the first token is missing or not a known child name. */
  MissingOrUnknown = "missingOrUnknown",
  /** Use the fallback only when the first token is not a known child name. */
  UnknownOnly = "unknownOnly",
}

/**
 * One CLI flag, option, or positional definition.
 */
export interface CliOptionDef {
  /** Option name (e.g., "name", "verbose"). */
  name: string;
  /** Description shown in help. */
  description: string;
  /** Option kind: presence flag, string value, or number value. */
  kind: CliOptionKind;
  /** Short option character (e.g., 'n' for -n). */
  shortName?: string;
  /** Whether this is a positional argument (true) or a flag/option (false). */
  positional: boolean;
  /** Minimum number of values required (for positionals). */
  argMin: number;
  /** Maximum number of values allowed (0 = unlimited, for positionals). */
  argMax: number;
}

/**
 * A command node: routing group (has children) or leaf (has handler).
 *
 * The value passed to cliRun is the program root: name is the app/binary name,
 * children are top-level subcommands, options are global flags.
 * The root must not set handler or declare positionals (validated at startup).
 */
export interface CliCommand {
  /** Program or command key (e.g., "myapp", "stat", "owner"). */
  key: string;
  /** Short description shown in help. */
  description: string;
  /** Additional notes shown in help (supports {app} placeholder). */
  notes?: string;
  /** Global or command-level flags/options. */
  options?: CliOptionDef[];
  /** Positional argument definitions. */
  positionals?: CliOptionDef[];
  /** Child subcommands (empty for leaf commands). */
  children?: CliCommand[];
  /** Handler function for leaf commands. */
  handler?: CliHandler;
  /** Default top-level subcommand when argv omits a command or uses an unknown first token (root only). */
  fallbackCommand?: string;
  /** How fallbackCommand is applied (root only). */
  fallbackMode?: CliFallbackMode;
}

/**
 * Handler closure type for leaf commands.
 * Supports both sync and async handlers.
 */
export type CliHandler = (ctx: CliContext) => void | Promise<void>;

/**
 * Error thrown when the static CliCommand tree violates ArgsBarg rules.
 */
export class CliSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliSchemaValidationError";
  }
}

/**
 * Creates a new CliOptionDef with sensible defaults.
 */
export function createOption(
  name: string,
  description: string,
  options?: Partial<CliOptionDef>,
): CliOptionDef {
  return {
    name,
    description,
    kind: options?.kind ?? CliOptionKind.Presence,
    shortName: options?.shortName,
    positional: options?.positional ?? false,
    argMin: options?.argMin ?? 1,
    argMax: options?.argMax ?? 1,
  };
}
