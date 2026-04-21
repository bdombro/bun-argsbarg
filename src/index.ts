/*
This entrypoint re-exports the public API and keeps the runtime split into modules.
It gathers the package surface in one place while the actual execution flow lives in
focused files for parsing, help, validation, completion, and runtime dispatch.

It gives consumers one stable import path without forcing them to know the internal
module layout.
*/

export { cliBuiltinCompletionGroup, completionBashScript, completionZshScript } from "./completion.ts";
export { cliRun, cliErrWithHelp } from "./runtime";
export { CliContext } from "./context.ts";
export { cliOptionLabel, cliHelpRender } from "./help.ts";
export { ParseKind, parse, postParseValidate } from "./parse.ts";
export type { ParseResult } from "./parse.ts";
export {
  CliOptionKind,
  CliFallbackMode,
  CliSchemaValidationError,
  createOption,
} from "./types.ts";
export type { CliOptionDef, CliCommand, CliHandler } from "./types.ts";
export { fullStringIsDouble, strictParseDouble } from "./utils.ts";
export { cliValidateRoot } from "./validate.ts";