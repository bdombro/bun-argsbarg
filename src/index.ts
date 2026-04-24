/*
This entrypoint re-exports the public API and keeps the runtime split into modules.
It gathers the package surface in one place while the actual execution flow lives in
focused files for parsing, help, validation, completion, and runtime dispatch.

It gives consumers one stable import path without forcing them to know the internal
module layout.
*/

export { CliContext } from "./context.ts";
export { cliErrWithHelp, cliRun } from "./runtime";
export { CliFallbackMode, CliOptionKind, CliSchemaValidationError } from "./types.ts";
export type { CliCommand, CliHandler, CliOption, CliPositional } from "./types.ts";
export { isInteractiveTty } from "./utils.ts";
