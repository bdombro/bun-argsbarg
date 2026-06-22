/*
Re-export shim — completion emitters and built-in trees live in ./builtins/.
*/

export {
  cliBuiltinCompletionGroup,
  cliBuiltinInstallCommand,
  cliBuiltinMcpCommand,
  cliPresentationRoot,
  completionBashScript,
  completionFishScript,
  completionZshScript,
} from "./builtins/index.ts";
