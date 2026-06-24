export { completionBashScript } from "./completion-bash.ts";
export { completionFishScript } from "./completion-fish.ts";
export { cliBuiltinCompletionGroup } from "./completion-group.ts";
export { completionZshScript } from "./completion-zsh.ts";
export { builtinInterceptRoot, dispatchBuiltin } from "./dispatch.ts";
export { type CliSchemaExport, exportPresentationBuiltins } from "./export.ts";
export { cliBuiltinInstallCommand, installBuiltinOptions } from "./install.ts";
export { cliBuiltinMcpCommand } from "./mcp.ts";
export {
  cliParseRoot,
  cliPresentationRoot,
  parseBuiltins,
  presentationBuiltins,
} from "./presentation.ts";
export { resolveBuiltins } from "./registry.ts";
export { collectScopes, type ScopeRec } from "./scopes.ts";
