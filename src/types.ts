/*
This module defines the CLI schema, option kinds, and fallback modes.
It is the shared declarative model that parsing, validation, help, and completion all
read from, so the package has one source of truth.

It gives the package one shared model for both library users and internal modules.
*/

import type { CliContext } from "./context.ts";

/**
 * Option kinds: presence (boolean flag), string (free-form text), or number (strict double).
 */
export enum CliOptionKind {
  /** Boolean flag: no value token (may be implicit `"1"` when set). */
  Presence = "presence",
  /** Free-form string value. */
  String = "string",
  /** Strict floating-point value (parsed at validation time). */
  Number = "number",
}

/**
 * When fallbackCommand is used for missing or unknown top-level tokens.
 * Only the program root may set a non-default mode or a non-nil fallbackCommand.
 */
export enum CliFallbackMode {
  /**
   * If argv has no first subcommand, route to `fallbackCommand`; if the first token is unknown, error.
   */
  MissingOnly = "missingOnly",
  /**
   * If argv has no first subcommand or the first token is not a known child, route to `fallbackCommand`.
   */
  MissingOrUnknown = "missingOrUnknown",
  /**
   * If the first token is present but not a known child, route to `fallbackCommand`.
   * When the first subcommand token is missing (empty argv), do not use fallback (implicit root help).
   */
  UnknownOnly = "unknownOnly",
}

/**
 * A named flag or value option (`--long`, `-short`), listed on `CliCommand.options`.
 */
export interface CliOption {
  /** Option name (e.g., "name", "verbose"). */
  name: string;
  /** Description shown in help. */
  description: string;
  /** Option kind: presence flag, string value, or number value. */
  kind: CliOptionKind;
  /** Short option character (e.g., 'n' for -n). */
  shortName?: string;
}

/**
 * An ordered positional argument slot, listed on `CliCommand.positionals`.
 */
export interface CliPositional {
  /** Positional name (used in help and error messages). */
  name: string;
  /** Description shown in help. */
  description: string;
  /** Value kind for each consumed token. */
  kind: CliOptionKind;
  /**
   * Minimum number of values required (default 1).
   * Use `0` for an optional slot when paired with `argMax: 1`, or a varargs tail with `argMax: 0`.
   */
  argMin?: number;
  /**
   * Maximum number of values (`1` = a single required or optional word; default 1). Use `0` for an
   * unbounded varargs tail (must be the last slot in the command’s `positionals` list).
   */
  argMax?: number;
}

/**
 * A command node: routing group (has commands) or leaf (has handler).
 *
 * The value passed to cliRun is the program root: name is the app/binary name,
 * commands are top-level subcommands, options are global flags.
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
  options?: CliOption[];
  /** Positional argument definitions. */
  positionals?: CliPositional[];
  /** Nested subcommands (empty for leaf commands). */
  commands?: CliCommand[];
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
  /** Creates a schema validation error with a human-readable rule violation. */
  constructor(message: string) {
    super(message);
    this.name = "CliSchemaValidationError";
  }
}
