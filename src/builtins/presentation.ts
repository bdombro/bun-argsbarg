import type { CliCapabilities } from "../capabilities.ts";
import { resolveCapabilities } from "../capabilities.ts";
import type { CliLeaf, CliNode, CliProgram, CliRouter } from "../types.ts";
import { isCliLeaf, isCliRouter } from "../types.ts";
import { cliBuiltinCompletionGroup } from "./completion-group.ts";
import { cliBuiltinInstallCommand } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliBuiltinVersionCommand } from "./version.ts";

/** Built-in command nodes injected for help, schema, and completions. */
export function presentationBuiltins(program: CliProgram, caps: CliCapabilities): CliNode[] {
  const builtins: CliNode[] = [
    cliBuiltinCompletionGroup(program.key),
    cliBuiltinVersionCommand(),
  ];
  if (caps.install) {
    builtins.push(cliBuiltinInstallCommand(program));
  }
  if (caps.mcp) {
    builtins.push(cliBuiltinMcpCommand());
  }
  return builtins;
}

/**
 * Returns a schema suitable for help display, including capability-built-in subtrees.
 * Routing programs get builtins merged; leaf programs are wrapped as a tiny router.
 */
export function cliPresentationRoot(program: CliProgram): CliRouter {
  const caps = resolveCapabilities(program);
  const builtins = presentationBuiltins(program, caps);

  if (isCliLeaf(program)) {
    return {
      key: program.key,
      description: program.description,
      options: program.options,
      commands: builtins,
    };
  }

  return {
    key: program.key,
    description: program.description,
    notes: program.notes,
    options: program.options,
    fallbackCommand: program.fallbackCommand,
    fallbackMode: program.fallbackMode,
    commands: [...program.commands, ...builtins],
  };
}

/** Presentation tree may include builtin leaf stubs. */
export type CliPresentationNode = CliNode | CliLeaf;
