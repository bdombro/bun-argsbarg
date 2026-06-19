/*
This module defines the CLI schema, option kinds, and fallback modes.
It is the shared declarative model that parsing, validation, help, and completion all
read from, so the package has one source of truth.

It gives the package one shared model for both library users and internal modules.
*/

import type { CliContext } from "./context.ts";

/**
 * How a leaf handler was dispatched.
 */
export type CliInvocation = "cli" | "mcp";

/**
 * Option kinds: presence (boolean flag), string (free-form text), number (strict double), or enum (fixed choices).
 */
export enum CliOptionKind {
  /** Boolean flag: no value token (may be implicit `"1"` when set). */
  Presence = "presence",
  /** Free-form string value. */
  String = "string",
  /** Strict floating-point value (parsed at validation time). */
  Number = "number",
  /** Fixed set of allowed string values. Requires non-empty `choices` on the option. */
  Enum = "enum",
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
  /** Whether this option must be provided. Cannot be used with Presence kind. */
  required?: boolean;
  /**
   * Allowed values. Required when kind === Enum; ignored otherwise.
   * Must be a non-empty array of distinct non-empty strings.
   */
  choices?: string[];
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
 * Root-only. Enables `myapp mcp` and MCP stdio server metadata.
 */
export interface CliMcpServerConfig {
  /** `initialize` serverInfo.name (default: root `key`). */
  name?: string;
  /** `initialize` serverInfo.version (default: see resolveMcpVersion). */
  version?: string;
  /** Resource URI for schema export (default: `"argsbarg://schema"`). */
  schemaResourceUri?: string;
  /**
   * Capture the user's login shell environment at MCP server start and merge it
   * into process.env. Solves missing PATH, nvm/rbenv shims, Homebrew binaries,
   * and shell exports that MCP hosts (e.g. Cursor) don't inherit.
   */
  shellEnv?: boolean | string;
  /**
   * Path to a .env file loaded into process.env at MCP server start, after shellEnv.
   * Supports `~` expansion. Warns on stderr if the file does not exist.
   * Always overwrites — envFile is authoritative for its keys.
   */
  envFile?: string;
  /**
   * Custom MCP resources exposed alongside the built-in argsbarg://schema resource.
   * URIs must be unique and must not equal schemaResourceUri.
   */
  resources?: CliMcpResource[];
}

/**
 * A custom MCP resource exposed under resources/list and resources/read.
 */
export interface CliMcpResource {
  /** Resource URI (must be unique; must not equal schemaResourceUri). */
  uri: string;
  /** Short display name for resources/list. */
  name: string;
  /** Optional human description for resources/list. */
  description?: string;
  /** MIME type (default: "text/plain"). */
  mimeType?: string;
  /** Called at resources/read time; must return the resource body. */
  load: () => string;
}

/**
 * Leaf-only. Controls how this command appears as an MCP tool.
 */
export interface CliMcpToolConfig {
  /** When `false`, omit from `tools/list` (default: exposed). */
  enabled?: boolean;
  /**
   * Override the generated MCP tool description.
   * Default: auto-generated from command path and description.
   */
  description?: string;
  /**
   * Environment variable names required at runtime.
   * Appended to auto-generated MCP tool descriptions; enforced at tools/call time.
   * Empty string counts as absent.
   */
  requiresEnv?: string[];
}

/**
 * Base properties shared by all command nodes.
 */
export interface CliCommandBase {
  /** Program or command key (e.g., "myapp", "stat", "owner"). */
  key: string;
  /** Short description shown in help. */
  description: string;
  /** Additional notes shown in help (supports {app} placeholder). */
  notes?: string;
  /** Global or command-level flags/options. */
  options?: CliOption[];
  /** Root-only. When set, enables the `mcp` built-in subcommand. */
  mcpServer?: CliMcpServerConfig;
  /** Leaf-only. Per-tool MCP exposure and metadata. */
  mcpTool?: CliMcpToolConfig;
}

/**
 * A command node: either a routing group (has commands) or a leaf (has handler).
 *
 * The value passed to cliRun is the program root: name is the app/binary name.
 * The root may be a routing group or a leaf command.
 */
export type CliCommand =
  | (CliCommandBase & {
      /** Handler function for leaf commands. */
      handler: CliHandler;
      /** Positional argument definitions. */
      positionals?: CliPositional[];
      /** Nested subcommands (empty for leaf commands). */
      commands?: never;
      /** Default top-level subcommand (routing commands only). */
      fallbackCommand?: never;
      /** How fallbackCommand is applied (routing commands only). */
      fallbackMode?: never;
    })
  | (CliCommandBase & {
      /** Nested subcommands. */
      commands: CliCommand[];
      /** Default top-level subcommand when argv omits a command or uses an unknown first token. */
      fallbackCommand?: string;
      /** How fallbackCommand is applied. */
      fallbackMode?: CliFallbackMode;
      /** Handler function (leaf commands only). */
      handler?: never;
      /** Positional argument definitions (leaf commands only). */
      positionals?: never;
    });

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
