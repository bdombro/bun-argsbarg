/*
This module defines the CLI schema, option kinds, and fallback modes.
It is the shared declarative model that parsing, validation, help, and completion all
read from, so the package has one source of truth.
*/

import type { z } from "zod";
import type { CommandContext, CommandInputs } from "./context.ts";
import { toJsonSchema } from "./zod-schema.ts";

/**
 * How a command handler was dispatched.
 */
export type Invocation = "cli" | "mcp" | "http";

/**
 * Option kinds: presence (boolean flag), string (free-form text), number (strict double), enum (fixed choices), or json (parsed JSON object/array).
 */
export const OptionKind = {
  /** Boolean flag: no value token (may be implicit `"1"` when set). */
  Presence: "presence",
  /** Free-form string value. */
  String: "string",
  /** Strict floating-point value (parsed at validation time). */
  Number: "number",
  /** Fixed set of allowed string values. Requires non-empty `choices` on the option. */
  Enum: "enum",
  /** JSON object or array (parsed from `--name '<json>'`, piped stdin when `pipable`, or MCP/API tool body). */
  Json: "json",
} as const;

/** Union of the `OptionKind` values. */
export type OptionKind = (typeof OptionKind)[keyof typeof OptionKind];

/**
 * Named validation/coercion for string options (`format` on `CommandOption`).
 * Positionals do not use `format`; varargs use space-separated CLI tokens and JSON arrays over MCP.
 */
export const ValueFormat = {
  /** Duration text such as `30s`, `20m`, `1h`, `2d` (default unit minutes when omitted). */
  Duration: "duration",
  /** Comma-separated list on a single option value (`--services a,b`). */
  CommaList: "comma-list",
  /** Calendar date `YYYY-MM-DD`. */
  Date: "date",
  /** RFC 3339 instant with `Z` or numeric offset. */
  DateTime: "date-time",
} as const;

/** Union of the `ValueFormat` values. */
export type ValueFormat = (typeof ValueFormat)[keyof typeof ValueFormat];

/**
 * When `fallbackCommand` is used for missing or unknown subcommand tokens at a routing node.
 */
export const FallbackMode = {
  /**
   * If argv has no next subcommand, route to `fallbackCommand`; if the token is unknown, error.
   */
  MissingOnly: "missingOnly",
  /**
   * If argv has no next subcommand or the token is not a known child, route to `fallbackCommand`.
   */
  MissingOrUnknown: "missingOrUnknown",
  /**
   * If the next token is present but not a known child, route to `fallbackCommand`.
   * When the subcommand token is missing (exhausted argv), do not use fallback (implicit scoped help).
   */
  UnknownOnly: "unknownOnly",
} as const;

/** Union of the `FallbackMode` values. */
export type FallbackMode = (typeof FallbackMode)[keyof typeof FallbackMode];

/**
 * Per-surface CLI exposure (help, completions, cli-schema).
 */
export interface CliExposureConfig {
  /** When `false`, not callable via CLI (cascades to descendants). Default: true. */
  enabled?: boolean;
  /** Callable; omit from help, completions, and schema export. */
  hidden?: boolean;
  completions?: { enabled?: boolean; hidden?: boolean };
  schema?: { enabled?: boolean; hidden?: boolean };
}

/** HTTP method for REST commands. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Per-node HTTP exposure and response defaults (groups: segment/enabled/hidden; runnable commands: full set).
 */
export interface HttpExposureConfig {
  /** When `false`, omit from HTTP route table. Default: exposed. */
  enabled?: boolean;
  /** Callable; omit from OpenAPI / route discovery. */
  hidden?: boolean;
  /** Override inferred HTTP verb. */
  method?: HttpMethod;
  /** URL path segment override (≠ `key`). */
  segment?: string;
  /** Default success HTTP status when handler omits `ctx.respond({ status })`. */
  successStatus?: number;
  /** Default success Content-Type (OpenAPI + response headers). */
  successContentType?: string;
  /** Default Content-Disposition for binary/downloads. */
  contentDisposition?: string;
}

/**
 * A named flag or value option (`--long`, `-short`), listed on command `options`.
 */
export interface CommandOption {
  /** Option name (e.g., "name", "verbose"). */
  name: string;
  /** Per-surface CLI exposure for this option. */
  cli?: Pick<CliExposureConfig, "hidden">;
  /** Description shown in help. */
  description: string;
  /** Option kind: presence flag, string value, or number value. */
  kind: OptionKind;
  /** Short option character (e.g., 'n' for -n). */
  shortName?: string;
  /** Whether this option must be provided. Cannot be used with Presence kind. */
  required?: boolean;
  /**
   * Allowed values. Required when kind === Enum; ignored otherwise.
   * Must be a non-empty array of distinct non-empty strings.
   */
  choices?: readonly string[];
  /**
   * Named string validation for `kind: String` options. Mutually exclusive with `pattern`.
   * Not supported on positionals.
   */
  format?: ValueFormat;
  /** Default value applied in post-parse when the option is omitted. */
  default?: string;
  /** Regex pattern for string options. Mutually exclusive with `format`. */
  pattern?: string;
  /**
   * When `true` on a `Json` option, CLI may omit `--name` and supply JSON via stdin instead.
   * If `--name` is set, the flag value wins and stdin is not read.
   */
  pipable?: boolean;
}

/**
 * An ordered positional argument slot, listed on command `positionals`.
 */
export interface CommandPositional {
  /** Positional name (used in help and error messages). */
  name: string;
  /** Description shown in help. */
  description: string;
  /** Value kind for each consumed token. */
  kind: OptionKind;
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

/** @experimental MCP bundle output options (app root `mcpServer.bundle` only). */
export interface McpBundleConfig {
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  /** Human-readable display name for plugin manifests. */
  displayName?: string;
  /** Homepage URL for plugin manifests. */
  homepage?: string;
  /** Repo-relative path to a PNG icon copied into the bundle. */
  icon?: string;
  /** Software license identifier (e.g. "MIT", "Apache-2.0"). */
  license?: string;
  /** Manifest `long_description` (defaults to program description). */
  longDescription?: string;
  /** Repository URL for plugin manifests. */
  repository?: string;
  /** Custom relative path to repository skills directory (defaults to `skills/<dirName>`). */
  skillsDir?: string;
}

/**
 * Enables `myapp mcp` and MCP stdio server metadata (app root only).
 * Must include `enabled: true`; omit `mcpServer` entirely to disable MCP.
 * @experimental
 */
export interface McpServerConfig {
  /** When `true`, enables the `mcp` built-in and MCP stdio server. */
  enabled: boolean;
  /**
   * Returned as `initialize.result.instructions`. Claude Code adds it to the system prompt of every
   * session; Cursor writes it to `mcps/<server>/INSTRUCTIONS.md`. Both cases cost context whether or
   * not the agent ends up using this server, so keep it to a one- or two-line pointer (e.g. when to
   * reach for this tool, and to read the accompanying skill first) rather than usage documentation.
   */
  instructions?: string;
  /** MCP error response defaults. */
  errors?: McpServerErrorsConfig;
  /** Observe-only hooks for JSON-RPC messages. */
  hooks?: McpWireHooks;
  /** When `true`, `mcp bundle` writes `dist/<key>.mcpb` for Claude Desktop. Default false. */
  mcpd?: boolean;
  /** When `true`, `mcp bundle` also writes `dist/claude-plugin/<name>.zip`. Default false. */
  claudePlugin?: boolean;
  /** When `true`, `mcp bundle` also writes `dist/cursor-plugin/<name>.zip`. Default false. */
  cursorPlugin?: boolean;
  /**
   * Capture the user's login shell environment at MCP server start and merge it
   * into process.env. Solves missing PATH, nvm/rbenv shims, Homebrew binaries,
   * and shell exports that MCP hosts (e.g. Cursor) don't inherit.
   */
  shellEnv?: boolean | string;
  /**
   * Custom MCP resources (`resources/list`, `resources/read`). URIs must be unique.
   */
  resources?: McpResource[];
  /** Optional MCP Bundle (`.mcpb`) metadata for `mcp bundle`. */
  bundle?: McpBundleConfig;
  /** Overrides the default startup size warnings (see {@link McpSizeLimits}). */
  sizeLimits?: McpSizeLimits;
}

/**
 * Size limits for one MCP tool's `description` and pretty-printed definition, and for `instructions`.
 * Set a field to `false` to disable that check. Defaults come from two client behaviors observed in the
 * wild, not from the MCP spec itself, so they may need retuning as those clients change:
 * Claude Code truncates a tool's `description` past `descriptionChars`; Cursor syncs each tool's full
 * definition (`{name, description, inputSchema, outputSchema}`, pretty-printed) to a file under
 * `mcps/<server>/tools/<tool>.json` and its agent reads that file in chunks of at most `definitionBytes`
 * bytes or `definitionLines` lines, whichever comes first — a tool at or beyond either limit is read
 * incompletely on the first pass.
 */
export interface McpSizeLimits {
  definitionBytes?: number | false;
  definitionLines?: number | false;
  descriptionChars?: number | false;
  instructionsChars?: number | false;
}

/** Emitted JSON Schema object (produced from Zod schemas by argsbarg; used by MCP, OpenAPI, help, and export). */
export type JsonSchema = Record<string, unknown>;

/** Wire-level HTTP hooks (observe-only; all requests including health and 404s). */
export interface HttpWireHooks {
  onRequest?: (ctx: HttpWireContext) => void | Promise<void>;
  onResponse?: (ctx: HttpWireContext & { status: number; durationMs: number }) => void | Promise<void>;
  onError?: (ctx: HttpWireContext & { failureKind: InvokeFailureKind; error: unknown }) => void | Promise<void>;
}

/** Per-request HTTP wire context for {@link HttpWireHooks}. */
export interface HttpWireContext {
  request: Request;
  requestId: string;
  clientIp: string;
  path: string;
  method: string;
  /** W3C trace id when `traceparent` is present on the request. */
  traceId?: string;
  /** Span id for this server hop when `traceparent` is present. */
  spanId?: string;
}

/** Wire-level MCP hooks on JSON-RPC messages (observe-only). */
export interface McpWireHooks {
  onRequest?: (ctx: McpWireContext) => void | Promise<void>;
  onResponse?: (ctx: McpWireContext & { durationMs: number }) => void | Promise<void>;
  onError?: (ctx: McpWireContext & { failureKind: InvokeFailureKind; error: unknown }) => void | Promise<void>;
}

/** Per-message MCP wire context for {@link McpWireHooks}. */
export interface McpWireContext {
  rpcMethod: string;
  requestId: string;
  toolName?: string;
}

/**
 * Enables `myapp http` and the HTTP tool server (app root only).
 * Must include `enabled: true`; omit `httpServer` entirely to disable HTTP.
 */
export interface HttpServerConfig {
  /** When `true`, enables the `http` built-in and HTTP tool server. */
  enabled: boolean;
  /** Listen host (default: `127.0.0.1`). */
  host?: string;
  /** Listen port (default: `3000`). */
  port?: number;
  /**
   * URL prefix for user command routes (default: `""` — routes at server root, e.g. `/workspaces`).
   * Set to `"/api"` for `/api/workspaces`-style paths.
   */
  pathPrefix?: string;
  /** Honor `X-Forwarded-For` for client IP in hooks and logs. */
  trustProxy?: boolean;
  /** HTTP error response defaults. */
  errors?: { errorSchema?: z.ZodType; obscureUnexpected?: boolean };
  /** Observe-only hooks for all HTTP requests. */
  hooks?: HttpWireHooks;
}

/** MCP server error defaults. */
export interface McpServerErrorsConfig {
  /** Zod schema for structured error bodies (emitted as JSON Schema in OpenAPI and MCP). */
  errorSchema?: z.ZodType;
  obscureUnexpected?: boolean;
}

/**
 * Declarative HTTP response hints passed to {@link apiSuccessResponse}.
 * @internal Prefer `HttpExposureConfig` on the command.
 */
export interface HttpResponseConfig {
  /** Default success Content-Type (default: `application/json`). */
  contentType?: string;
  /** Optional Content-Disposition (e.g. `attachment; filename="invoice.pdf"`). */
  contentDisposition?: string;
}

/** Body types accepted by {@link CommandContext.respond}. */
export type RespondBody = string | Uint8Array | Record<string, unknown> | unknown[];

/** Options for {@link CommandContext.respond} and headless invoke results. */
export interface RespondOptions {
  body: RespondBody;
  /** Default: `application/json` for objects/arrays, `text/plain` for strings; binary requires explicit type. */
  contentType?: string;
  /** HTTP status (default: 200). */
  status?: number;
  headers?: Record<string, string>;
}

/**
 * A custom MCP resource exposed under resources/list and resources/read.
 */
export interface McpResource {
  /** Resource URI (must be unique). */
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
 * Runnable commands only. Controls how this command appears as an MCP tool.
 */
export interface McpToolConfig {
  /** When `false`, omit from `tools/list` (default: exposed). */
  enabled?: boolean;
  /** Callable; omit from `tools/list` and MCP tool schemas. */
  hidden?: boolean;
  /**
   * Override the generated MCP tool description.
   * Default: auto-generated from command path and description.
   */
  description?: string;
  /**
   * Overrides the command's `notes` in the MCP description only — CLI help always shows `notes` unchanged.
   * `false` omits notes from the MCP description entirely; a string replaces them. Omit to use `notes` as
   * given. Useful when a note only makes sense with `--help` in front of it (a CLI-only workflow tip), or
   * when the full CLI notes would push a definition past a size limit (see {@link McpSizeLimits}).
   */
  notes?: string | false;
}

/** Opt-out for the `completion` built-in (default: enabled). */
export interface CompletionConfig {
  /** When `false`, hide/disable `completion` (default: enabled). */
  enabled?: boolean;
}

/**
 * Base properties shared by all nodes in the user command tree.
 */
export interface CommandBase {
  /** App or command key (e.g., "myapp", "stat", "owner"). */
  key: string;
  /** Per-surface CLI exposure. */
  cli?: CliExposureConfig;
  /** Per-surface HTTP exposure and response defaults. */
  http?: HttpExposureConfig;
  /** Short description shown in help. */
  description: string;
  /** Additional notes shown in help (`{argsbarg:program}` → program key). */
  notes?: string;
  /** Global or command-level flags/options. */
  options?: readonly CommandOption[];
}

/** Command input mode: `document` = structured JSON document body (no CLI flags). */
export type CommandKind = "document";

/** Handler `ctx.inputs` type for a command: the schema's parsed output, or coerced option/positional values. */
export type CommandInputsOf<I> = [I] extends [z.ZodType] ? z.output<I> : CommandInputs;

/** Handler `ctx.pathParams` type for a command: the `pathParams` schema's parsed output, or raw string segments. */
export type CommandPathParamsOf<P> = [P] extends [z.ZodObject] ? z.output<P> : Record<string, string>;

/** Handler return type for a command: the output schema's type (or nothing), or `unknown` without an output schema. */
// biome-ignore lint/suspicious/noConfusingVoidType: `void` lets handlers that only print (no return) type-check.
export type CommandResultOf<O> = [O] extends [z.ZodType] ? z.output<O> | void : unknown;

/**
 * A command that runs a handler (with optional positionals).
 * Use {@link command} to get `ctx.inputs` and the return value typed from `inputSchema` / `outputSchema`.
 */
export type RunnableCommand<
  I extends z.ZodType | undefined = z.ZodType | undefined,
  O extends z.ZodType | undefined = z.ZodType | undefined,
  P extends z.ZodObject | undefined = z.ZodObject | undefined,
> = CommandBase & {
  /**
   * When `"document"`, the command accepts a single JSON document
   * (CLI positional or piped stdin; MCP/HTTP tool args = body). Requires `inputSchema`;
   * forbids `options` and `positionals`.
   */
  kind?: CommandKind;
  /** Handler (method syntax so typed commands fit in heterogeneous `commands` arrays). */
  handler(
    ctx: CommandContext<CommandInputsOf<I>, CommandPathParamsOf<P>>,
  ): CommandResultOf<O> | Promise<CommandResultOf<O>>;
  /** Positional argument definitions. */
  positionals?: readonly CommandPositional[];
  /**
   * Zod schema for structured stdout (e.g. with `--json` or MCP when the handler emits JSON).
   * Emitted in schema export, MCP `tools/list`, and OpenAPI; not validated at runtime.
   */
  outputSchema?: O;
  /**
   * Zod schema for tool arguments and merged CLI inputs. Validated before the handler runs;
   * the parsed value becomes `ctx.inputs`.
   */
  inputSchema?: I;
  /**
   * Zod object schema for the `:param` segments above this command (keys = param names without `:`). Validated
   * before the handler; the parsed value becomes `ctx.pathParams`. Field descriptions are shown to MCP and OpenAPI.
   */
  pathParams?: P;
  /** Per-tool MCP exposure and metadata. */
  mcpTool?: McpToolConfig;
};

/**
 * A routing command node with nested subcommands.
 */
export type CommandGroup = CommandBase & {
  /** Nested subcommands. */
  commands: Command[];
  /** Default subcommand when argv omits a command or uses an unknown token at this routing node. */
  fallbackCommand?: string;
  /** How fallbackCommand is applied at this routing node. */
  fallbackMode?: FallbackMode;
};

/**
 * A command in the tree: runnable (`handler`) or a group of subcommands (`commands`).
 */
export type Command = RunnableCommand | CommandGroup;

/** Classified failure kind for invoke error pipeline and HTTP/MCP status mapping. */
export type InvokeFailureKind = "validation" | "help" | "unexpected" | "unknown_route";

/**
 * Per-invocation context attached in hooks (e.g. DB handles, auth principals).
 * Augment in app code: `declare module "argsbarg" { interface Locals { db: AppDb } }`.
 */
export interface Locals {
  /** Correlation id seeded before hooks run (HTTP/MCP wire id or generated UUID). */
  requestId?: string;
}

/**
 * Cross-request server state (HTTP/MCP runtime bag).
 * Augment in app code: `declare module "argsbarg" { interface ServerState { db: AppDb } }`.
 */
export interface ServerState {
  /** Short-TTL cache for readiness probe results. */
  readinessCache?: {
    at: number;
    result: { ok: boolean; checks: Record<string, { ok: boolean; error?: string; missing?: string[] }> };
  };
  /** Last readiness probe result. */
  readiness?: { ok: boolean; checks: Record<string, { ok: boolean; error?: string; missing?: string[] }> };
}

/** Cross-request mutable state created at HTTP/MCP server start. */
export interface ServerRuntime {
  /** Mutable global bag (DB pool, degraded flags, readiness cache, etc.). */
  state: ServerState;
  spec: AppSpec;
  surface: "http" | "mcp";
}

/** Context for app-level invoke hooks (CLI, HTTP, MCP user commands). */
export interface InvokeHookContext {
  invocation: Invocation;
  path: string[];
  pathParams: Record<string, string>;
  opts: Record<string, string>;
  /** Per-invocation bag; `beforeInvoke` may write. Framework seeds `requestId` before hooks run. */
  locals: Locals;
  runtime?: ServerRuntime;
  http?: { request: Request; clientIp: string; requestId: string; traceId?: string; spanId?: string };
  mcp?: { rpcMethod: string; toolName?: string; requestId: string };
}

/** Error hook context after failure classification. */
export interface ErrorHookContext extends InvokeHookContext {
  failureKind: InvokeFailureKind;
  error: unknown;
  /** Default client-facing error before `formatError` override. */
  clientError: ClientErrorOverride;
}

/** Client-facing error payload; `formatError` may return a partial override. */
export interface ClientErrorOverride {
  message: string;
  exitCode?: number;
}

/** Minimal invoke result passed to `afterInvoke` (see {@link App.invoke}). */
export interface InvokeHookResult {
  kind: "ok" | "help" | "error";
  exitCode: number;
  failureKind?: InvokeFailureKind;
  errorMsg?: string;
}

/** App-level invoke and error hooks (skipped for builtins). */
export interface AppHooks {
  /** May mutate `locals`, `opts`, `args`; may throw. Skipped for builtins. */
  beforeInvoke?: (ctx: InvokeHookContext) => void | Promise<void>;
  afterInvoke?: (ctx: InvokeHookContext & { result: InvokeHookResult }) => void | Promise<void>;
  /** Mutate client-facing error payload only. Runs before `onError`. */
  formatError?: (ctx: ErrorHookContext) => ClientErrorOverride | undefined | Promise<ClientErrorOverride | undefined>;
  /** Observe only — runs after `formatError`; may enrich `locals`. Never mutates client response. */
  onError?: (ctx: ErrorHookContext) => void | Promise<void>;
}

/** Context for optional `readiness` (HTTP/MCP health only). */
export interface ReadinessContext {
  spec: AppSpec;
  surface: "http" | "mcp";
  runtime: ServerRuntime;
}

/** Framework logging defaults (ECS Logging json or human text on stderr). */
export interface LogConfig {
  /** `json` = ECS Logging lines; `text` = human stderr lines. Default: `json`. */
  format?: "json" | "text";
  /** Tee stderr + append; relative paths resolve against the working directory. */
  file?: string;
  /** Emit HTTP/MCP access logs. Default: true. */
  access?: boolean;
  /** Emit error events after the hook pipeline. Default: true. */
  errors?: boolean;
  /**
   * Add non-standard fields to each JSON log line after the ECS baseline.
   * Cannot override `@timestamp`, `log.level`, `message`, `ecs.version`, or service fields.
   */
  enrich?: (ctx: import("../log/ecs.ts").LogEnrichContext) => Record<string, unknown>;
  /**
   * Full control over JSON log line serialization. When set, bypasses the built-in ECS formatter.
   * The consumer owns the entire line (including newline omission).
   */
  serialize?: (ctx: import("../log/ecs.ts").LogEnrichContext) => string;
}

/**
 * App spec passed to `argsbarg()`.
 * May be a command or command group, plus optional app-level MCP and HTTP config.
 */
export type AppSpec = Command & AppSpecFields;

/** Root settings shared by grouping and runnable roots (see {@link AppSpec} and `argsbarg()`). */
export type AppSpecFields = {
  /** Opt-out for shell completion generation (`completion bash|zsh|fish`). */
  completion?: CompletionConfig;
  /** Invoke and error hooks for user commands on CLI, HTTP, and MCP. */
  hooks?: AppHooks;
  /** When set with `enabled: true`, enables the `http` built-in HTTP server. */
  httpServer?: HttpServerConfig;
  /** Framework logging (stderr + optional file). */
  log?: LogConfig;
  /** When set with `enabled: true`, enables the `mcp` built-in subcommand. */
  mcpServer?: McpServerConfig;
  /** Optional readiness probe for HTTP/MCP `GET /health/readiness` only. */
  readiness?: (ctx: ReadinessContext) => boolean | Promise<boolean>;
  /** App version (printed by the `version` built-in and MCP serverInfo). */
  version: string;
};

/** True when the command runs a handler. */
export function hasHandler(node: Command): node is RunnableCommand {
  return "handler" in node && typeof node.handler === "function";
}

/** True when the command accepts a structured JSON document body (no CLI flags). */
export function isDocumentCommand(
  /** Command to inspect. */
  leaf: RunnableCommand,
): boolean {
  return leaf.kind === "document";
}

/** True when the node is a command group (has subcommands). */
export function hasSubcommands(node: Command): node is CommandGroup {
  return "commands" in node && Array.isArray(node.commands);
}

/** Emitted JSON Schema for the command's structured stdout, when it declares an `outputSchema`. */
export function leafOutputSchema(leaf: RunnableCommand): JsonSchema | undefined {
  return leaf.outputSchema === undefined ? undefined : toJsonSchema(leaf.outputSchema, "output");
}

/** Emitted JSON Schema for the command's `inputSchema`, when set. */
export function leafInputSchema(leaf: RunnableCommand): JsonSchema | undefined {
  return leaf.inputSchema === undefined ? undefined : toJsonSchema(leaf.inputSchema, "input");
}

/**
 * Declares a command. With a `handler` it runs: `ctx.inputs` is typed from its `inputSchema` (or its `options` /
 * `positionals` literals), `ctx.pathParams` from `pathParams`, and the return value from `outputSchema`. With
 * `commands` it groups subcommands and keeps its literal type. Identity at runtime.
 */
export function command<const T extends CommandGroup>(
  /** Command that groups subcommands. */
  group: T,
): NoInfer<T>;
export function command<
  I extends z.ZodType | undefined = undefined,
  O extends z.ZodType | undefined = undefined,
  P extends z.ZodObject | undefined = undefined,
  const Opts extends readonly CommandOption[] = [],
  const Pos extends readonly CommandPositional[] = [],
>(
  /** Command that runs a handler. */
  runnable: CommandDef<I, O, P, Opts, Pos>,
  // NoInfer: generics come from the definition, never from where the result is used (e.g. a `commands` array).
): RunnableCommand<NoInfer<I>, NoInfer<O>, NoInfer<P>>;
export function command(
  /** Command definition. */
  node: Command,
): Command {
  return node;
}

/**
 * Runnable command definition accepted by {@link command}: a {@link RunnableCommand} whose `options` / `positionals` literals
 * type `ctx.inputs` when there is no `inputSchema` (see {@link CommandOptionInputs}).
 */
export type CommandDef<
  I extends z.ZodType | undefined,
  O extends z.ZodType | undefined,
  P extends z.ZodObject | undefined,
  Opts extends readonly CommandOption[],
  Pos extends readonly CommandPositional[],
> = Omit<RunnableCommand<I, O, P>, "handler" | "options" | "positionals"> & {
  /** Command-local flags/options (their literal types drive `ctx.inputs` typing). */
  options?: Opts;
  /** Positional argument definitions (their literal types drive `ctx.inputs` typing). */
  positionals?: Pos;
  /** Handler function. */
  handler(
    ctx: CommandContext<
      [I] extends [z.ZodType] ? z.output<I> : CommandOptionInputs<Opts> & CommandPositionalInputs<Pos>,
      CommandPathParamsOf<P>
    >,
  ): CommandResultOf<O> | Promise<CommandResultOf<O>>;
};

/** Value type `ctx.inputs` holds for one option definition (after argsbarg's coercion). */
export type CommandOptionValueOf<Opt extends CommandOption> = Opt extends { kind: typeof OptionKind.Presence }
  ? boolean
  : Opt extends { kind: typeof OptionKind.Number }
    ? number
    : Opt extends { kind: typeof OptionKind.Enum; choices: readonly (infer C)[] }
      ? C
      : Opt extends { kind: typeof OptionKind.Json }
        ? unknown
        : Opt extends { format: typeof ValueFormat.Duration }
          ? number
          : Opt extends { format: typeof ValueFormat.CommaList }
            ? string[]
            : string;

/** True when an option always has a value in `ctx.inputs` (presence flags, `required`, or a `default`). */
type OptionAlwaysSet<Opt> = Opt extends { kind: typeof OptionKind.Presence }
  ? true
  : Opt extends { required: true }
    ? true
    : Opt extends { default: string }
      ? true
      : false;

/** `ctx.inputs` shape for a command's own options (root and ancestor options are present at runtime but untyped). */
export type CommandOptionInputs<Opts extends readonly CommandOption[]> = {
  [Opt in Opts[number] as OptionAlwaysSet<Opt> extends true ? Opt["name"] : never]: CommandOptionValueOf<Opt>;
} & {
  [Opt in Opts[number] as OptionAlwaysSet<Opt> extends true ? never : Opt["name"]]?: CommandOptionValueOf<Opt>;
};

/** Value type for one positional slot: a single word, or a `string[]` for multi-value / varargs slots. */
type PositionalValueOf<Pos extends CommandPositional> = Pos extends { argMax: number }
  ? Pos["argMax"] extends 1
    ? string
    : string[]
  : string;

/** True when a positional always has a value (single slot with `argMin` ≥ 1, the default). */
type PositionalAlwaysSet<Pos> = Pos extends { argMin: 0 } ? false : true;

/** `ctx.inputs` shape for a command's positionals. */
export type CommandPositionalInputs<Pos extends readonly CommandPositional[]> = {
  [Slot in Pos[number] as PositionalAlwaysSet<Slot> extends true ? Slot["name"] : never]: PositionalValueOf<Slot>;
} & {
  [Slot in Pos[number] as PositionalAlwaysSet<Slot> extends true ? never : Slot["name"]]?: PositionalValueOf<Slot>;
};

/**
 * Error thrown when the static CLI tree violates ArgsBarg rules.
 */
export class SchemaValidationError extends Error {
  /** Creates a schema validation error with a human-readable rule violation. */
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}
