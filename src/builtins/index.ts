export { completionBashScript } from "./completion/bash.ts";
export { completionFishScript } from "./completion/fish.ts";
export { cliBuiltinCompletionGroup } from "./completion/group.ts";
export { collectScopes, type ScopeRec } from "./completion/scopes.ts";
export { completionZshScript } from "./completion/zsh.ts";
export { builtinInterceptRoot, dispatchBuiltin } from "./dispatch.ts";
export { exportPresentationBuiltins, type SchemaExport } from "./export.ts";
export { cliBuiltinMcpCommand } from "./mcp.ts";
export {
  cliParseRoot,
  cliPresentationRoot,
  parseBuiltins,
  presentationBuiltins,
} from "./presentation.ts";
export { resolveBuiltins } from "./registry.ts";
