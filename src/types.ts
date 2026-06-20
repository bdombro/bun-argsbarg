/*
This module defines the CLI schema, option kinds, and fallback modes.
It is the shared declarative model that parsing, validation, help, and completion all
read from, so the package has one source of truth.
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
 * When `fallbackCommand` is used for missing or unknown subcommand tokens at a routing node.
 */
export enum CliFallbackMode {
  /**
   * If argv has no next subcommand, route to `fallbackCommand`; if the token is unknown, error.
   */
  MissingOnly = "missingOnly",
  /**
   * If argv has no next subcommand or the token is not a known child, route to `fallbackCommand`.
   */
  MissingOrUnknown = "missingOrUnknown",
  /**
   * If the next token is present but not a known child, route to `fallbackCommand`.
   * When the subcommand token is missing (exhausted argv), do not use fallback (implicit scoped help).
   */
  UnknownOnly = "unknownOnly",
}

/**
 * A named flag or value option (`--long`, `-short`), listed on command `options`.
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
 * An ordered positional argument slot, listed on leaf `positionals`.
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
 * Enables `myapp mcp` and MCP stdio server metadata (program root only).
 * Must include `enabled: true`; omit `mcpServer` entirely to disable MCP.
 */
export interface CliMcpServerConfig {
  /** When `true`, enables the `mcp` built-in and MCP stdio server. */
  enabled: boolean;
  /** Resource URI for schema export (default: `<sanitized root key>://schema`). */
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
   * Custom MCP resources exposed alongside the built-in schema resource.
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
 * Opt-out and defaults for the `install` built-in (program root only).
 */
export interface CliInstallConfig {
  /** When `false`, hide/disable `install` (default: enabled). */
  enabled?: boolean;
  /** Default bin directory (default: `~/.local/bin`). Overridden by `INSTALL_PREFIX` env and `--prefix`. */
  prefix?: string;
}

/**
 * One bundled documentation topic for the `docs` built-in (program root only).
 */
export interface CliDocsTopic {
  /** Bundled markdown (use compile-time text imports in the consumer). */
  text: string;
  /** Leaf help text for `myapp docs <key> -h`. Auto-generated from key when omitted. */
  description?: string;
}

/**
 * Enables `myapp docs` and bundled markdown topics (program root only).
 * Must include `enabled: true`; omit `docs` entirely to disable.
 */
export interface CliDocsConfig {
  /** When `true`, enables the `docs` built-in command group. */
  enabled: boolean;
  /** Router description for `myapp docs` (default: "Print bundled CLI documentation."). */
  description?: string;
  /**
   * Subcommand for bare `myapp docs` (maps to router `fallbackCommand`).
   * When omitted, uses the first key in `topics` (insertion order).
   */
  defaultTopic?: string;
  /** Topic key → bundled markdown. Reserved keys: `mcp`, `all` (supplied by the built-in). */
  topics: Record<string, CliDocsTopic>;
}

/**
 * Base properties shared by all nodes in the user command tree.
 */
export interface CliNodeBase {
  /** Program or command key (e.g., "myapp", "stat", "owner"). */
  key: string;
  /** Short description shown in help. */
  description: string;
  /** Additional notes shown in help (supports {app} placeholder). */
  notes?: string;
  /** Global or command-level flags/options. */
  options?: CliOption[];
}

/**
 * A leaf command node with a handler and optional positionals.
 */
export type CliLeaf = CliNodeBase & {
  /** Handler function for leaf commands. */
  handler: CliHandler;
  /** Positional argument definitions. */
  positionals?: CliPositional[];
  /** Per-tool MCP exposure and metadata. */
  mcpTool?: CliMcpToolConfig;
};

/**
 * A routing command node with nested subcommands.
 */
export type CliRouter = CliNodeBase & {
  /** Nested subcommands. */
  commands: CliNode[];
  /** Default subcommand when argv omits a command or uses an unknown token at this routing node. */
  fallbackCommand?: string;
  /** How fallbackCommand is applied at this routing node. */
  fallbackMode?: CliFallbackMode;
};

/**
 * A node in the user-defined command tree (router or leaf).
 */
export type CliNode = CliLeaf | CliRouter;

/**
 * Program root passed to `cliRun` / `cliInvoke`.
 * May be a leaf or router, plus optional program-level MCP and install config.
 */
export type CliProgram = CliNode & {
  /** Program version (printed by the `version` built-in and MCP serverInfo). */
  version: string;
  /** When set with `enabled: true`, enables the `mcp` built-in subcommand. */
  mcpServer?: CliMcpServerConfig;
  /** Opt-out and defaults for `install`. */
  install?: CliInstallConfig;
  /** When set with `enabled: true`, enables the `docs` built-in command group. */
  docs?: CliDocsConfig;
};

/** True when the node is a leaf (has a handler). */
export function isCliLeaf(node: CliNode): node is CliLeaf {
  return "handler" in node && typeof node.handler === "function";
}

/** True when the node is a router (has subcommands). */
export function isCliRouter(node: CliNode): node is CliRouter {
  return "commands" in node && Array.isArray(node.commands);
}

/**
 * Handler closure type for leaf commands.
 * Supports both sync and async handlers.
 */
export type CliHandler = (ctx: CliContext) => void | Promise<void>;

/**
 * Error thrown when the static CLI tree violates ArgsBarg rules.
 */
export class CliSchemaValidationError extends Error {
  /** Creates a schema validation error with a human-readable rule violation. */
  constructor(message: string) {
    super(message);
    this.name = "CliSchemaValidationError";
  }
}
