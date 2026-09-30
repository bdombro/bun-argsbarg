import type { AppSpec } from "../../core/types.ts";

/**
 * Builds the static `completion` / `bash` / `zsh` / `fish` command subtree (merged into the app root at runtime).
 */
export function cliBuiltinCompletionGroup(program: AppSpec): import("../../core/types.ts").CommandGroup {
  const appName = program.key;
  const router: import("../../core/types.ts").CommandGroup = {
    key: "completion",
    cli: { hidden: true },
    description: "Generate the autocompletion script for shells.",
    commands: [
      {
        key: "bash",
        description: "Print a bash tab-completion script.",
        notes:
          "Load in the current session:\n\n" +
          `  source <(${appName} completion bash)\n\n` +
          "Load in every session (add to ~/.bashrc):\n\n" +
          `  eval "$(${appName} completion bash)"`,
        handler: () => {},
      },
      {
        key: "zsh",
        description: "Print a zsh tab-completion script.",
        notes:
          "Load in the current session:\n\n" +
          `  eval "$(${appName} completion zsh)"\n\n` +
          "Load in every session (add to ~/.zshrc after compinit):\n\n" +
          `  eval "$(${appName} completion zsh)"`,
        handler: () => {},
      },
      {
        key: "fish",
        description: "Print a fish tab-completion script.",
        notes:
          "Load in the current session:\n\n" +
          `  ${appName} completion fish | source\n\n` +
          "Load in every session:\n\n" +
          `  ${appName} completion fish > ~/.config/fish/completions/${appName}.fish`,
        handler: () => {},
      },
    ],
  };
  router.notes = `Print a completion script for your shell; see \`${appName} completion <shell> --help\` for setup.`;
  return router;
}
