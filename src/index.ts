/*
This entrypoint re-exports the public API and keeps the runtime split into modules.
It gathers the package surface in one place while the actual execution flow lives in
focused files for parsing, help, validation, completion, and runtime dispatch.

It gives consumers one stable import path without forcing them to know the internal
module layout.
*/

export { CliContext } from "./context.ts";
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
export type { CliInvokeKind, CliInvokeResult } from "./invoke.ts";
export { cliInvoke } from "./invoke.ts";
export type { McpBundlePaths, PackMcpBundleOpts } from "./mcp/bundle.ts";
export { defaultMcpBundlePaths, generateMcpManifest, packMcpBundle } from "./mcp/bundle.ts";
export { cliErrWithHelp, cliRun } from "./runtime";
export type {
  CliDocsConfig,
  CliDocsTopic,
  CliHandler,
  CliInstallConfig,
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
} from "./types.ts";
export { CliFallbackMode, CliOptionKind, CliSchemaValidationError } from "./types.ts";
export { isInteractiveTty } from "./utils.ts";
