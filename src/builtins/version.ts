import type { RunnableCommand } from "../core/types.ts";

/** Top-level `version` built-in (leaf). */
export function cliBuiltinVersionCommand(): RunnableCommand {
  return {
    key: "version",
    description: "Print the program version.",
    handler: () => {},
  };
}
