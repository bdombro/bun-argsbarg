import type { CliLeaf, CliProgram } from "../types.ts";
import { cliUpdate } from "../install/update.ts";

/** Built-in `update` command (enabled when `install.updateGetLatest` is set). */
export function cliBuiltinUpdateCommand(program: CliProgram): CliLeaf {
  return {
    key: "update",
    description: "Download and install the latest release.",
    mcpTool: { enabled: false },
    handler: async () => {
      await cliUpdate(program);
    },
  };
}
