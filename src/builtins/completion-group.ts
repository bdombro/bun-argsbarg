import type { CliProgram } from "../types.ts";

/**
 * Builds the static `completion` / `bash` / `zsh` / `fish` command subtree (merged into the program root at runtime).
 */
export function cliBuiltinCompletionGroup(program: CliProgram): import("../types.ts").CliRouter {
  const appName = program.key;
  const router: import("../types.ts").CliRouter = {
    key: "completion",
    hidden: true,
    description: "Generate the autocompletion script for shells.",
    commands: [
      {
        key: "bash",
        description: "Print a bash tab-completion script.",
        notes:
          "Homebrew installs completions during `brew install` via generate_completions_from_executable.\n\n" +
          "Ensure your shell loads Homebrew completions:\n" +
          "  https://docs.brew.sh/Shell-Completion\n\n" +
          "Try this session only:\n\n" +
          `  source <(${appName} completion bash)`,
        handler: () => {},
      },
      {
        key: "zsh",
        description: "Print a zsh tab-completion script.",
        notes:
          "Homebrew installs completions to $(brew --prefix)/share/zsh/site-functions.\n\n" +
          "Ensure brew shellenv + compinit are configured:\n" +
          "  https://docs.brew.sh/Shell-Completion\n\n" +
          "Try this session only:\n\n" +
          `  eval "$(${appName} completion zsh)"`,
        handler: () => {},
      },
      {
        key: "fish",
        description: "Print a fish tab-completion script.",
        notes:
          "Homebrew installs completions to $(brew --prefix)/share/fish/vendor_completions.d.\n\n" +
          "See: https://docs.brew.sh/Shell-Completion\n\n" +
          "Try this session only:\n\n" +
          `  ${appName} completion fish | source`,
        handler: () => {},
      },
    ],
  };
  router.notes =
    "Completions are installed by Homebrew during formula install.\n\n" + "See: https://docs.brew.sh/Shell-Completion";
  return router;
}
