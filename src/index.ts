/*
This entrypoint re-exports the public API and keeps the runtime split into modules.
It gathers the package surface in one place while the actual execution flow lives in
focused files for parsing, help, validation, completion, and runtime dispatch.

It gives consumers one stable import path without forcing them to know the internal
module layout.
*/

export { displayAppConfigPath, resolveAppConfigPath } from "./config/file.ts";
export type { CliLeafInputs } from "./core/context.ts";
export { CliContext } from "./core/context.ts";
export {
  parseCommaList,
  parseDate,
  parseDateTime,
  parseDurationMs,
} from "./core/formats.ts";
export {
  LeafInputError,
  preloadPipableJson,
  readJsonOptionValue,
} from "./core/leaf-inputs.ts";
export type {
  CliAppConfig,
  CliAppConfigEntry,
  CliAppConfigResolveContext,
  CliAppConfigResolveFn,
  CliConfigureConfig,
  CliConfigureTargets,
  CliDocsConfig,
  CliDocsTopic,
  ClientErrorOverride,
  CliHandler,
  CliHttpServerConfig,
  CliHttpWireContext,
  CliHttpWireHooks,
  CliInvocation,
  CliInvokeHookResult,
  CliLeafKind,
  CliLocals,
  CliLogConfig,
  CliMcpBundleConfig,
  CliMcpResource,
  CliMcpServerConfig,
  CliMcpToolConfig,
  CliMcpWireContext,
  CliMcpWireHooks,
  CliOption,
  CliPositional,
  CliProgram,
  CliProgramHooks,
  CliRespondBody,
  CliRespondOptions,
  ErrorHookContext,
  InstallAgentIntegration,
  InstallTargetSpec,
  InvokeFailureKind,
  InvokeHookContext,
  ReadinessContext,
  ResolvedInstallTarget,
  ServerRuntime,
  ServerState,
} from "./core/types.ts";
export {
  CliFallbackMode,
  CliOptionKind,
  CliSchemaValidationError,
  CliValueFormat,
  isJsonLeaf,
} from "./core/types.ts";
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
export type { EcsLogEvent, LogEnrichContext } from "./log/ecs.ts";
export { ECS_VERSION, formatEcsLine } from "./log/ecs.ts";
export type { McpBundlePaths, PackMcpBundleOpts } from "./mcp/bundle.ts";
export { defaultMcpBundlePaths, generateMcpManifest, packMcpBundle } from "./mcp/bundle.ts";
export { Cli, type CliInvokeKind, type CliInvokeResult } from "./runtime/cli.ts";
export { cliErrWithHelp } from "./runtime/cli-errors.ts";
export { isInteractiveTty } from "./utils.ts";
