/*
This module defines the CLI schema, option kinds, and fallback modes.
It is the shared declarative model that parsing, validation, help, and completion all
read from, so the package has one source of truth.
*/

import type { AnyAppConfigSnapshot } from "../config/context.ts";
import type { CliContext } from "./context.ts";

/**
 * How a leaf handler was dispatched.
 */
export type CliInvocation = "cli" | "mcp" | "http";

/**
 * Option kinds: presence (boolean flag), string (free-form text), number (strict double), enum (fixed choices), or json (parsed JSON object/array).
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
  /** JSON object or array (parsed from `--name '<json>'`, piped stdin when `pipable`, or MCP/API tool body). */
  Json = "json",
}

/**
 * Named validation/coercion for string options (`format` on `CliOption`).
 * Positionals do not use `format`; varargs use space-separated CLI tokens and JSON arrays over MCP.
 */
export enum CliValueFormat {
  /** Duration text such as `30s`, `20m`, `1h`, `2d` (default unit minutes when omitted). */
  Duration = "duration",
  /** Comma-separated list on a single option value (`--services a,b`). */
  CommaList = "comma-list",
  /** Calendar date `YYYY-MM-DD`. */
  Date = "date",
  /** RFC 3339 instant with `Z` or numeric offset. */
  DateTime = "date-time",
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
 * Per-surface CLI exposure (help, completions, cli-schema).
 */
export interface CliCliExposureConfig {
  /** When `false`, not callable via CLI (cascades to descendants). Default: true. */
  enabled?: boolean;
  /** Callable; omit from help, completions, and schema export. */
  hidden?: boolean;
  completions?: { enabled?: boolean; hidden?: boolean };
  schema?: { enabled?: boolean; hidden?: boolean };
}

/** HTTP method for REST leaves. */
export type CliHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Per-node HTTP exposure and response defaults (routers: segment/enabled/hidden; leaves: full set).
 */
export interface CliHttpExposureConfig {
  /** When `false`, omit from HTTP route table. Default: exposed. */
  enabled?: boolean;
  /** Callable; omit from OpenAPI / route discovery. */
  hidden?: boolean;
  /** Override inferred HTTP verb. */
  method?: CliHttpMethod;
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
export interface CliOption {
  /** Option name (e.g., "name", "verbose"). */
  name: string;
  /** Per-surface CLI exposure for this option. */
  cli?: Pick<CliCliExposureConfig, "hidden">;
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
  /**
   * Named string validation for `kind: String` options. Mutually exclusive with `pattern`.
   * Not supported on positionals.
   */
  format?: CliValueFormat;
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

/** @experimental MCP bundle output options (program root `mcpServer.bundle` only). */
export interface CliMcpBundleConfig {
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  /** Repo-relative path to a PNG icon copied into the bundle. */
  icon?: string;
  /** Manifest `long_description` (defaults to program description). */
  longDescription?: string;
}

/**
 * Enables `myapp mcp` and MCP stdio server metadata (program root only).
 * Must include `enabled: true`; omit `mcpServer` entirely to disable MCP.
 * @experimental
 */
export interface CliMcpServerConfig {
  /** When `true`, enables the `mcp` built-in and MCP stdio server. */
  enabled: boolean;
  /** MCP error response defaults. */
  errors?: CliMcpServerErrorsConfig;
  /** Observe-only hooks for JSON-RPC messages. */
  hooks?: CliMcpWireHooks;
  /** When `true`, `mcp bundle` writes `dist/<key>.mcpb` for Claude Desktop. Default false. */
  mcpd?: boolean;
  /** When `true`, `mcp bundle` also writes `dist/claude-plugin/<name>.zip`. Default false. */
  claudePlugin?: boolean;
  /** Resource URI for schema export (default: `<sanitized root key>://schema`). */
  schemaResourceUri?: string;
  /**
   * Capture the user's login shell environment at MCP server start and merge it
   * into process.env. Solves missing PATH, nvm/rbenv shims, Homebrew binaries,
   * and shell exports that MCP hosts (e.g. Cursor) don't inherit.
   */
  shellEnv?: boolean | string;
  /**
   * Custom MCP resources exposed alongside the built-in schema resource.
   * URIs must be unique and must not equal schemaResourceUri.
   */
  resources?: CliMcpResource[];
  /** Optional MCP Bundle (`.mcpb`) metadata for `mcp bundle`. */
  bundle?: CliMcpBundleConfig;
}

/** JSON Schema for structured error responses (OpenAPI + HTTP/MCP error bodies). */
export type CliJsonSchema = Record<string, unknown>;

/** Wire-level HTTP hooks (observe-only; all requests including health and 404s). */
export interface CliHttpWireHooks {
  onRequest?: (ctx: CliHttpWireContext) => void | Promise<void>;
  onResponse?: (ctx: CliHttpWireContext & { status: number; durationMs: number }) => void | Promise<void>;
  onError?: (ctx: CliHttpWireContext & { failureKind: InvokeFailureKind; error: unknown }) => void | Promise<void>;
}

/** Per-request HTTP wire context for {@link CliHttpWireHooks}. */
export interface CliHttpWireContext {
  request: Request;
  requestId: string;
  clientIp: string;
  path: string;
  method: string;
}

/** Wire-level MCP hooks on JSON-RPC messages (observe-only). */
export interface CliMcpWireHooks {
  onRequest?: (ctx: CliMcpWireContext) => void | Promise<void>;
  onResponse?: (ctx: CliMcpWireContext & { durationMs: number }) => void | Promise<void>;
  onError?: (ctx: CliMcpWireContext & { failureKind: InvokeFailureKind; error: unknown }) => void | Promise<void>;
}

/** Per-message MCP wire context for {@link CliMcpWireHooks}. */
export interface CliMcpWireContext {
  rpcMethod: string;
  requestId: string;
  toolName?: string;
}

/**
 * Enables `myapp http` and the HTTP tool server (program root only).
 * Must include `enabled: true`; omit `httpServer` entirely to disable HTTP.
 */
export interface CliHttpServerConfig {
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
  errors?: { errorSchema?: CliJsonSchema; obscureUnexpected?: boolean };
  /** Observe-only hooks for all HTTP requests. */
  hooks?: CliHttpWireHooks;
}

/** MCP server error defaults. */
export interface CliMcpServerErrorsConfig {
  errorSchema?: CliJsonSchema;
  obscureUnexpected?: boolean;
}

/**
 * Declarative HTTP response hints passed to {@link apiSuccessResponse}.
 * @internal Prefer `CliHttpExposureConfig` on the leaf.
 */
export interface CliHttpResponseConfig {
  /** Default success Content-Type (default: `application/json`). */
  contentType?: string;
  /** Optional Content-Disposition (e.g. `attachment; filename="invoice.pdf"`). */
  contentDisposition?: string;
}

/** Body types accepted by {@link CliContext.respond}. */
export type CliRespondBody = string | Uint8Array | Record<string, unknown> | unknown[];

/** Options for {@link CliContext.respond} and headless invoke results. */
export interface CliRespondOptions {
  body: CliRespondBody;
  /** Default: `application/json` for objects/arrays, `text/plain` for strings; binary requires explicit type. */
  contentType?: string;
  /** HTTP status (default: 200). */
  status?: number;
  headers?: Record<string, string>;
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
  /** Callable; omit from `tools/list` and MCP tool schemas. */
  hidden?: boolean;
  /**
   * Override the generated MCP tool description.
   * Default: auto-generated from command path and description.
   */
  description?: string;
}

/**
 * Opt-out and defaults for the `install` built-in (program root only).
 */
export interface CliUpdateArtifact {
  /** Path to an executable binary to copy into the install location. */
  path: string;
  /** Release version of `path` (used for already-current checks and success messages). */
  version?: string;
  /** Called after reinstall completes (e.g. remove a temp download directory). */
  cleanup?: () => void | Promise<void>;
}

/** Fetches the latest release binary for `install --update`. */
export type CliUpdateGetLatest = (ctx: { version: string }) => Promise<CliUpdateArtifact>;

/** Context passed to {@link CliAppConfigEntry.resolve} for one config key. */
export interface CliAppConfigResolveContext {
  /** Schema key being resolved. */
  key: string;
  /** Entry metadata for this key. */
  entry: CliAppConfigEntry;
  /** Program root (read-only). */
  program: CliProgram;
  /** Raw value from the config file, if any. */
  fileValue: unknown;
  /** Non-empty host env string when `entry.env` is set; otherwise `undefined`. */
  envValue: string | undefined;
}

/**
 * Optional fallback resolver for one config key (e.g. `gh auth token` when `GH_TOKEN` is unset).
 * Return `undefined` to continue resolution (env, then default).
 */
export type CliAppConfigResolveFn = (ctx: CliAppConfigResolveContext) => unknown;

/**
 * Metadata overlay for one key in {@link CliAppConfig.entries}.
 * Types and validation come from {@link CliAppConfig.jsonSchema} when set; otherwise all values are strings.
 */
export interface CliAppConfigEntry {
  /** Help text for prompts, MCP manifests, and generated docs. */
  description: string;
  /** Short label in host UIs and CLI prompts. Default: the config key. */
  title?: string;
  /** Default when `jsonSchema` is omitted (all-string mode). */
  default?: string;
  /** When `false`, optional for bootstrap and MCP enforcement. Default: `true`. */
  required?: boolean;
  /**
   * Mask stdin during prompts and redact on `configure get`.
   * Default: `/key|token|secret|password/i.test(name)`.
   */
  sensitive?: boolean;
  /** When set: non-empty `process.env[env]` overrides file; value exported after resolve. */
  env?: string;
  /**
   * Optional fallback after file when env is empty.
   * Return `undefined` to fall back to `env` (if set) and schema defaults.
   */
  resolve?: CliAppConfigResolveFn;
}

/**
 * App configuration block on the program root ({@link CliProgram.appConfig}).
 */
export interface CliAppConfig {
  /** Built-in `configure get` / `configure set`. Default: enabled when `appConfig` is set. */
  commands?: boolean | { enabled?: boolean; mcpSet?: boolean };
  /** Block JSON Schema (draft-07). When omitted, synthesize all-string schema from `entries`. */
  jsonSchema?: Record<string, unknown>;
  /** Per-key metadata; keys must match `jsonSchema.properties` when `jsonSchema` is set. */
  entries: Record<string, CliAppConfigEntry>;
}

/** Opt-out for the `completion` built-in (default: enabled). */
export interface CliCompletionConfig {
  /** When `false`, hide/disable `completion` (default: enabled). */
  enabled?: boolean;
}

/** @experimental */
export interface CliConfigureConfig {
  /** When `false`, hide/disable `configure` (default: enabled). */
  enabled?: boolean;
  /**
   * Default agent integration for sync (`configure --sync`).
   * - `'mcp'` when `mcpServer.enabled` (default): MCP targets in sync; paired skills excluded.
   * - `'skill'` when MCP is off (default): skill targets in sync; paired MCP excluded.
   * - `'both'`: sync MCP and skill for the same host when both are available.
   */
  agentIntegration?: InstallAgentIntegration;
  /** Per-artifact gates for configure sync and interactive wizard. See {@link resolveEffectiveInstallTargets}. */
  targets?: CliConfigureTargets;
}

/** Agent integration mode for install — MCP vs shell skill per host. */
export type InstallAgentIntegration = "mcp" | "skill" | "both";

/** Boolean or structured gate for one install artifact. */
export type InstallTargetSpec =
  | boolean
  | {
      /** When false, artifact is never installed (even with scoped CLI flags). Default true. */
      enabled?: boolean;
      /** When true, included in `configure --sync`. Default varies by key. */
      includedInAll?: boolean;
    };

export interface ResolvedInstallTarget {
  enabled: boolean;
  includedInAll: boolean;
}

/** Per-artifact gates for configure. See {@link resolveEffectiveInstallTargets}. */
export interface CliConfigureTargets {
  /** App binary status only (Homebrew PATH); no self-install. */
  app?: InstallTargetSpec;
  /** ChatGPT desktop MCP. Default false. */
  chatgptMcp?: InstallTargetSpec;
  /** Claude Code MCP (`~/.claude.json`). Default false. */
  claudeCodeMcp?: InstallTargetSpec;
  /** Claude Desktop MCP. Default false. */
  claudeDesktopMcp?: InstallTargetSpec;
  /** Claude Code skill. Default false. */
  claudeSkill?: InstallTargetSpec;
  /** Codex MCP (`codex mcp add`). Default false. */
  codexMcp?: InstallTargetSpec;
  /** Codex skill. Default false. */
  codexSkill?: InstallTargetSpec;
  /** App config: interactive wizard step in `configure`. Default not in sync. */
  configure?: InstallTargetSpec;
  /** Cursor MCP. Default false. */
  cursorMcp?: InstallTargetSpec;
  /** Cursor skill. Default false. */
  cursorSkill?: InstallTargetSpec;
  /** OpenClaw MCP. Default false. */
  openclawMcp?: InstallTargetSpec;
  /** OpenClaw skill. Default false. */
  openclawSkill?: InstallTargetSpec;
  /** OpenCode MCP. Default false. */
  opencodeMcp?: InstallTargetSpec;
  /** OpenCode skill. Default false. */
  opencodeSkill?: InstallTargetSpec;
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
 * Opt-out and optional topics for the `docs` built-in (program root only).
 * Docs is enabled by default; set `enabled: false` to disable.
 */
export interface CliDocsConfig {
  /** When `false`, hide/disable `docs` (default: enabled). */
  enabled?: boolean;
  /** Router description for `myapp docs` (default: "Print bundled CLI documentation."). */
  description?: string;
  /** Optional consumer markdown topics. Reserved keys: `mcp`, `all` (supplied by the built-in). */
  topics?: Record<string, CliDocsTopic>;
}

/**
 * Base properties shared by all nodes in the user command tree.
 */
export interface CliNodeBase {
  /** Program or command key (e.g., "myapp", "stat", "owner"). */
  key: string;
  /** Per-surface CLI exposure. */
  cli?: CliCliExposureConfig;
  /** Per-surface HTTP exposure and response defaults. */
  http?: CliHttpExposureConfig;
  /** Short description shown in help. */
  description: string;
  /** Additional notes shown in help (`{argsbarg:program}` → program key). */
  notes?: string;
  /** Global or command-level flags/options. */
  options?: CliOption[];
}

/** Leaf input mode: `json` = pure JSON body (no CLI flags). */
export type CliLeafKind = "json";

/**
 * A leaf command node with a handler and optional positionals.
 */
export type CliLeaf = CliNodeBase & {
  /**
   * When `"json"`, the leaf accepts a single JSON document (CLI positional or piped stdin;
   * MCP/HTTP tool args = body). Requires `inputSchema`; forbids `options` and `positionals`.
   */
  kind?: CliLeafKind;
  /** Handler function for leaf commands. */
  handler: CliHandler;
  /** Positional argument definitions. */
  positionals?: CliPositional[];
  /**
   * JSON Schema for structured stdout (e.g. with `--json` or MCP when the handler emits JSON).
   * Exported in `docs cli-schema`, `docs cli`, and MCP `tools/list`; not validated at runtime yet.
   */
  outputSchema?: Record<string, unknown>;
  /** JSON Schema for MCP/HTTP tool arguments (flat object). */
  inputSchema?: Record<string, unknown>;
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

/** Classified failure kind for invoke error pipeline and HTTP/MCP status mapping. */
export type InvokeFailureKind = "validation" | "help" | "unexpected" | "not_ready" | "missing_config" | "unknown_route";

/**
 * Per-invocation context attached in hooks (e.g. DB handles, auth principals).
 * Augment in app code: `declare module "argsbarg" { interface CliLocals { db: AppDb } }`.
 */
export interface CliLocals {
  /** Correlation id seeded before hooks run (HTTP/MCP wire id or generated UUID). */
  requestId?: string;
}

/**
 * Cross-request server state (HTTP/MCP runtime bag).
 * Augment in app code: `declare module "argsbarg" { interface ServerState { db: AppDb } }`.
 */
export interface ServerState {
  /** Set when app config soft-validation fails at server start. */
  configFileError?: string;
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
  program: CliProgram;
  surface: "http" | "mcp";
}

/** Context for program-level invoke hooks (CLI, HTTP, MCP user commands). */
export interface InvokeHookContext {
  invocation: CliInvocation;
  path: string[];
  pathParams: Record<string, string>;
  opts: Record<string, string>;
  /** Per-invocation bag; `beforeInvoke` may write. Framework seeds `requestId` before hooks run. */
  locals: CliLocals;
  runtime?: ServerRuntime;
  appConfig: AnyAppConfigSnapshot;
  http?: { request: Request; clientIp: string; requestId: string };
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

/** Minimal invoke result passed to `afterInvoke` (see {@link Cli.invoke}). */
export interface CliInvokeHookResult {
  kind: "ok" | "help" | "error";
  exitCode: number;
  failureKind?: InvokeFailureKind;
  errorMsg?: string;
}

/** Program-level invoke and error hooks (skipped for builtins). */
export interface CliProgramHooks {
  /** May mutate `locals`, `opts`, `args`; may throw. Skipped for builtins. */
  beforeInvoke?: (ctx: InvokeHookContext) => void | Promise<void>;
  afterInvoke?: (ctx: InvokeHookContext & { result: CliInvokeHookResult }) => void | Promise<void>;
  /** Mutate client-facing error payload only. Runs before `onError`. */
  formatError?: (ctx: ErrorHookContext) => ClientErrorOverride | undefined | Promise<ClientErrorOverride | undefined>;
  /** Observe only — runs after `formatError`; may enrich `locals`. Never mutates client response. */
  onError?: (ctx: ErrorHookContext) => void | Promise<void>;
}

/** Context for optional `program.readiness` (HTTP/MCP health only). */
export interface ReadinessContext {
  program: CliProgram;
  surface: "http" | "mcp";
  appConfig: AnyAppConfigSnapshot;
  runtime: ServerRuntime;
}

/** Framework logging defaults (ECS json or human text on stderr). */
export interface CliLogConfig {
  /** `json` = ECS lines; `text` = human stderr lines. Default: `json`. */
  format?: "json" | "text";
  /** Tee stderr + append; relative paths resolve under the app config dir. */
  file?: string;
  /** Emit HTTP/MCP access logs. Default: true. */
  access?: boolean;
  /** Emit error events after the hook pipeline. Default: true. */
  errors?: boolean;
}

/**
 * Program root passed to {@link Cli}.
 * May be a leaf or router, plus optional program-level MCP and install config.
 */
export type CliProgram = CliNode & {
  /** Program version (printed by the `version` built-in and MCP serverInfo). */
  version: string;
  /** Schema-driven app config file, bootstrap, and MCP metadata. */
  appConfig?: CliAppConfig;
  /** When set with `enabled: true`, enables the `mcp` built-in subcommand. */
  mcpServer?: CliMcpServerConfig;
  /** When set with `enabled: true`, enables the `http` built-in HTTP server. */
  httpServer?: CliHttpServerConfig;
  /** Opt-out and defaults for `configure`. */
  configure?: CliConfigureConfig;
  /** Opt-out for shell completion generation (`completion bash|zsh|fish`). */
  completion?: CliCompletionConfig;
  /** Opt-out and optional topics for the `docs` built-in (default: enabled). */
  docs?: CliDocsConfig;
  /** Invoke and error hooks for user commands on CLI, HTTP, and MCP. */
  hooks?: CliProgramHooks;
  /** Optional readiness probe for HTTP/MCP `GET /health/readiness` only. */
  readiness?: (ctx: ReadinessContext) => boolean | Promise<boolean>;
  /** Framework logging (stderr + optional file). */
  log?: CliLogConfig;
};

/** True when the node is a leaf (has a handler). */
export function isCliLeaf(node: CliNode): node is CliLeaf {
  return "handler" in node && typeof node.handler === "function";
}

/** True when the leaf accepts a pure JSON body (no CLI flags). */
export function isJsonLeaf(leaf: CliLeaf): boolean {
  return leaf.kind === "json";
}

/** True when the node is a router (has subcommands). */
export function isCliRouter(node: CliNode): node is CliRouter {
  return "commands" in node && Array.isArray(node.commands);
}

/** Resolves structured stdout schema from the leaf. */
export function leafOutputSchema(leaf: CliLeaf): Record<string, unknown> | undefined {
  return leaf.outputSchema;
}

/**
 * Handler closure type for leaf commands.
 * Supports sync and async handlers; non-undefined return values become implicit JSON responses for headless invocations.
 */
export type CliHandler = (ctx: CliContext) => unknown | Promise<unknown>;

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
