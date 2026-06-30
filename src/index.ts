/*
This entrypoint re-exports the public API and keeps the runtime split into modules.
It gathers the package surface in one place while the actual execution flow lives in
focused files for parsing, help, validation, completion, and runtime dispatch.

It gives consumers one stable import path without forcing them to know the internal
module layout.
*/

export { Cli, type CliInvokeKind, type CliInvokeResult } from "./cli.ts";
export { cliErrWithHelp } from "./cli-errors.ts";
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
export type { GhReleaseUpdateConfig, GhVersionCheckConfig } from "./install/gh-release-update.ts";
export {
  createGhFetchLatest,
  createGhVersionCheck,
  ghReleaseUpdateGetLatest,
  isAlreadyCurrent,
  parseReleaseTag,
} from "./install/gh-release-update.ts";
export type { McpBundlePaths, PackMcpBundleOpts } from "./mcp/bundle.ts";
export { defaultMcpBundlePaths, generateMcpManifest, packMcpBundle } from "./mcp/bundle.ts";
export type {
  CliAppConfig,
  CliAppConfigEntry,
  CliDocsConfig,
  CliDocsTopic,
  CliHandler,
  CliInstallConfig,
  CliInstallTargets,
  CliInvocation,
  CliMcpBundleConfig,
  CliMcpResource,
  CliMcpServerConfig,
  CliMcpToolConfig,
  CliOption,
  CliPositional,
  CliProgram,
  CliUpdateArtifact,
  CliUpdateGetLatest,
  InstallAgentIntegration,
  InstallTargetSpec,
  ResolvedInstallTarget,
} from "./types.ts";
export {
  CliFallbackMode,
  CliOptionKind,
  CliSchemaValidationError,
  CliValueFormat,
} from "./types.ts";
export { isInteractiveTty } from "./utils.ts";
