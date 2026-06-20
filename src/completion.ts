/*
Re-export shim — completion emitters and built-in trees live in ./builtins/.
*/

export {
  completionBashScript,
  completionZshScript,
  completionFishScript,
  cliPresentationRoot,
  cliBuiltinCompletionGroup,
  cliBuiltinInstallCommand,
  cliBuiltinMcpCommand,
} from "./builtins/index.ts";
