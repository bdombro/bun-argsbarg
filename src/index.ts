/*
This entrypoint re-exports the public API and keeps the runtime split into modules.
It gathers the package surface in one place while the actual execution flow lives in
focused files for parsing, help, validation, completion, and runtime dispatch.

It gives consumers one stable import path without forcing them to know the internal
module layout. It is the package's only entry point: every public type is exported here explicitly.
*/

export type { SchemaExport } from "./builtins/export.ts";
export type { AnyAppConfigSnapshot } from "./config/context.ts";
export { displayAppConfigPath, resolveAppConfigPath } from "./config/file.ts";
export type { ResolvedConfig } from "./config/resolve.ts";
export type { CommandInputs } from "./core/context.ts";
export { CommandContext } from "./core/context.ts";
export {
  parseCommaList,
  parseDate,
  parseDateTime,
  parseDurationMs,
} from "./core/formats.ts";
export {
  InputError,
  parseDocumentText,
  preloadPipableJson,
  readJsonOptionValue,
} from "./core/leaf-inputs.ts";
export type { SchemaRootExport } from "./core/schema.ts";
export type {
  AppConfig,
  AppConfigEntry,
  AppConfigResolveContext,
  AppConfigResolveFn,
  AppHooks,
  AppSpec,
  AppSpecFields,
  CliExposureConfig,
  ClientErrorOverride,
  Command,
  CommandBase,
  CommandDef,
  CommandGroup,
  CommandInputsOf,
  CommandKind,
  CommandOption,
  CommandOptionInputs,
  CommandOptionValueOf,
  CommandPathParamsOf,
  CommandPositional,
  CommandPositionalInputs,
  CommandResultOf,
  CompletionConfig,
  ConfigureConfig,
  ConfigureHookContext,
  ConfigureTargets,
  DocsConfig,
  DocsTopic,
  ErrorHookContext,
  HttpExposureConfig,
  HttpMethod,
  HttpResponseConfig,
  HttpServerConfig,
  HttpWireContext,
  HttpWireHooks,
  InstallTargetSpec,
  Invocation,
  InvokeFailureKind,
  InvokeHookContext,
  InvokeHookResult,
  JsonSchema,
  Locals,
  LogConfig,
  McpBundleConfig,
  McpResource,
  McpServerConfig,
  McpServerErrorsConfig,
  McpSizeLimits,
  McpToolConfig,
  McpWireContext,
  McpWireHooks,
  ReadinessContext,
  ResolvedInstallTarget,
  RespondBody,
  RespondOptions,
  RunnableCommand,
  ServerRuntime,
  ServerState,
} from "./core/types.ts";
export {
  command,
  FallbackMode,
  isDocumentCommand,
  OptionKind,
  SchemaValidationError,
  ValueFormat,
} from "./core/types.ts";
export { schemaStrictnessWarnings } from "./core/validate.ts";
export { buildCommandInputSchema, commandWireOptions } from "./core/wire-schema.ts";
export type { HeadlessContext } from "./headless/routing.ts";
export {
  formatDryRunMessage,
  requireYesInNonTty,
  shouldRunHeadless,
  shouldRunHeadlessWithPositionals,
  shouldRunHeadlessWithYes,
  wantsExplicitJson,
} from "./headless/routing.ts";
export { generateOpenApi, openApiJson } from "./http/openapi.ts";
export { handleApiRequest, httpServeHttp, resolveHttpListenAddress } from "./http/server.ts";
export type { EcsLogEvent, EcsLogLevel, EcsServiceFields, FormatEcsLineOpts, LogEnrichContext } from "./log/ecs.ts";
export { ECS_VERSION, formatEcsLine } from "./log/ecs.ts";
export type { LogEmitterOpts, ResolvedLogConfig } from "./log/emitter.ts";
export type { McpBundlePaths, PackMcpBundleOpts } from "./mcp/bundle.ts";
export { defaultMcpBundlePaths, generateMcpManifest, packMcpBundle } from "./mcp/bundle.ts";
export {
  defaultClaudePluginPaths,
  generatePluginManifest,
  generatePluginMcpJson,
  packClaudePlugin,
} from "./mcp/claude.ts";
export {
  defaultCursorPluginPaths,
  generateCursorPluginManifest,
  generateCursorPluginMcpJson,
  packCursorPlugin,
} from "./mcp/cursor.ts";
export type { McpSizeReport, McpToolSize } from "./mcp/tools.ts";
export { DEFAULT_MCP_SIZE_LIMITS, mcpSizeReport } from "./mcp/tools.ts";
export { userHome } from "./paths/host.ts";
export type { Capabilities } from "./runtime/capabilities.ts";
export { type App, argsbarg, type InvokeKind, type InvokeResult } from "./runtime/cli.ts";
export { cliErrWithHelp } from "./runtime/cli-errors.ts";
export type { ServerHandleContext } from "./server/context.ts";
export type { ResolvedHttpServeConfig, ResolvedMcpServeConfig, ServeOverrides } from "./server/overrides.ts";
export { isInteractiveTty } from "./utils.ts";
