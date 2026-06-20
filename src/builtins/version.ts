import { type CliLeaf } from "../types.ts";

/** Top-level `version` built-in (leaf). */
export function cliBuiltinVersionCommand(): CliLeaf {
  return {
    key: "version",
    description: "Print the program version.",
    handler: () => {},
  };
}
