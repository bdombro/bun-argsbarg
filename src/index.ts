/*
This entrypoint re-exports the public API and keeps the runtime split into modules.
It gathers the package surface in one place while the actual execution flow lives in
focused files for parsing, help, validation, completion, and runtime dispatch.

It gives consumers one stable import path without forcing them to know the internal
module layout.
*/

export { generateOpenApi, openApiJson } from "./api/openapi.ts";
export { Cli, type CliInvokeKind, type CliInvokeResult } from "./cli.ts";
export { cliErrWithHelp } from "./cli-errors.ts";
export { displayAppConfigPath, resolveAppConfigPath } from "./config/file.ts";
export type { CliLeafInputs } from "./context.ts";
export { CliContext } from "./context.ts";
export {
  parseCommaList,
  parseDate,
  parseDateTime,
  parseDurationMs,
} from "./formats.ts";
export type { HeadlessContext } from "./headless.ts";
export {
  formatDryRunMessage,
  requireYesInNonTty,
  shouldRunHeadless,
  shouldRunHeadlessWithPositionals,
  shouldRunHeadlessWithYes,
  wantsExplicitJson,
} from "./headless.ts";
export {
  LeafInputError,
  loadLeafInputs,
  preloadPipableJson,
  readJsonOptionValue,
  readLeafInputs,
  readLeafInputsAsync,
} from "./leaf-inputs.ts";
export type { McpBundlePaths, PackMcpBundleOpts } from "./mcp/bundle.ts";
export { defaultMcpBundlePaths, generateMcpManifest, packMcpBundle } from "./mcp/bundle.ts";
export type {
  CliApiResponseConfig,
  CliApiServerConfig,
  CliAppConfig,
  CliAppConfigEntry,
  CliAppConfigResolveContext,
  CliAppConfigResolveFn,
  CliConfigureConfig,
  CliConfigureTargets,
  CliDocsConfig,
  CliDocsTopic,
  CliHandler,
  CliInvocation,
  CliLeafKind,
  CliMcpBundleConfig,
  CliMcpResource,
  CliMcpServerConfig,
  CliMcpToolConfig,
  CliOption,
  CliPositional,
  CliProgram,
  CliRespondBody,
  CliRespondOptions,
  InstallAgentIntegration,
  InstallTargetSpec,
  ResolvedInstallTarget,
} from "./types.ts";
export {
  CliFallbackMode,
  CliOptionKind,
  CliSchemaValidationError,
  CliValueFormat,
  isJsonLeaf,
} from "./types.ts";
export { isInteractiveTty } from "./utils.ts";
