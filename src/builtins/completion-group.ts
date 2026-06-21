import { resolveCapabilities } from "../capabilities.ts";
import { type CliLeaf, type CliProgram, type CliRouter } from "../types.ts";

/**
 * Builds the static `completion` / `bash` / `zsh` / `fish` command subtree (merged into the program root at runtime).
 */
export function cliBuiltinCompletionGroup(program: CliProgram): CliRouter {
  const appName = program.key;
  const caps = resolveCapabilities(program);
  const router: CliRouter = {
    key: "completion",
    description: "Generate the autocompletion script for shells.",
    commands: [
      {
        key: "bash",
        description: "Print a bash tab-completion script.",
        notes:
          "Manual install:\n\n" +
          `  ${appName} completion bash > ~/.bash_completion.d/${appName}\n` +
          `  echo 'source ~/.bash_completion.d/${appName}' >> ~/.bashrc\n\n` +
          "Try this session only:\n\n" +
          `  source <(${appName} completion bash)`,
        handler: () => {},
      },
      {
        key: "zsh",
        description: "Print a zsh tab-completion script.",
        notes:
          "Manual install:\n\n" +
          `  ${appName} completion zsh > ~/.zsh/completions/_${appName}\n\n` +
          "Ensure ~/.zsh/completions is on your fpath, then restart zsh.\n\n" +
          "Try this session only:\n\n" +
          `  eval "$(${appName} completion zsh)"`,
        handler: () => {},
      },
      {
        key: "fish",
        description: "Print a fish tab-completion script.",
        notes:
          "Manual install:\n\n" +
          `  ${appName} completion fish > ~/.config/fish/completions/${appName}.fish\n\n` +
          "Fish loads completions from that directory automatically.",
        handler: () => {},
      },
    ],
  };
  if (caps.install) {
    router.notes = `Install for all shells:\n\n  ${appName} install --completions --yes`;
  }
  return router;
}
