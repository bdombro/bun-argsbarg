import { CliCommand } from "../types.ts";
import { isCompiledExecutable } from "../install/compiled.ts";
import { cliBuiltinCompletionGroup } from "./completion-group.ts";
import { cliBuiltinInstallCommand } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";

/** Built-in commands shown in help and merged for routing CLIs. */
export function presentationBuiltins(root: CliCommand): CliCommand[] {
  const builtins: CliCommand[] = [cliBuiltinCompletionGroup(root.key)];
  if (isCompiledExecutable() && root.install?.enabled !== false) {
    builtins.push(cliBuiltinInstallCommand(root));
  }
  if (root.mcpServer !== undefined) {
    builtins.push(cliBuiltinMcpCommand());
  }
  return builtins;
}

/**
 * Returns a schema suitable for help display, including reserved built-in subtrees.
 * Routing roots get builtins merged; leaf roots are wrapped as a tiny router.
 */
export function cliPresentationRoot(root: CliCommand): CliCommand {
  if ((root.commands ?? []).some((c) => c.key === "completion")) {
    return root;
  }
  if ("handler" in root && root.handler) {
    return {
      key: root.key,
      description: root.description,
      options: root.options,
      commands: presentationBuiltins(root),
    } as CliCommand;
  }
  return {
    ...root,
    commands: [...(root.commands ?? []), ...presentationBuiltins(root)],
  } as CliCommand;
}
