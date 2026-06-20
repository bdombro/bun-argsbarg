import { CliCommand } from "../types.ts";

/**
 * Builds the static `completion` / `bash` / `zsh` / `fish` command subtree (merged into the program root at runtime).
 */
export function cliBuiltinCompletionGroup(appName: string): CliCommand {
  return {
    key: "completion",
    description: "Generate the autocompletion script for shells.",
    commands: [
      {
        key: "bash",
        description: "Print a bash tab-completion script.",
        notes:
          "Output is the whole script.\n" +
          "Pipe it to a file, or feed it straight into your shell.\n\n" +
          "To keep it across restarts, save it and source that file from ~/.bashrc.\n\n" +
          "For example:\n\n" +
          `echo 'eval \"$(${appName} completion bash)\"' >> ~/.bashrc\n` +
          `\nor\n` +
          `  ${appName} completion bash > ~/.bash_completion.d/${appName}\n` +
          `  echo 'source ~/.bash_completion.d/${appName}' >> ~/.bashrc\n\n` +
          "To try it only in this session (nothing written to disk):\n" +
          `  source <(${appName} completion bash)`,
        handler: () => {},
      },
      {
        key: "zsh",
        description: "Print a zsh tab-completion script.",
        notes:
          "Output is the whole script.\n\n" +
          `fpath setup: ${appName} completion zsh > ~/.zsh/completions/_${appName}\n\n` +
          `source setup: echo 'eval \"$(${appName} completion zsh)\"' >> ~/.zshrc\n\n` +
          "To try it only in this session (nothing written to disk):\n" +
          `  eval \"$(${appName} completion zsh)\"`,
        handler: () => {},
      },
      {
        key: "fish",
        description: "Print a fish tab-completion script.",
        notes:
          "Output is the whole script.\n\n" +
          "Install:\n" +
          `  ${appName} completion fish > ~/.config/fish/completions/${appName}.fish\n\n` +
          "Fish loads completions from that directory automatically.",
        handler: () => {},
      },
    ],
  };
}
