import type { AppSpec, Command, RunnableCommand } from "../core/types.ts";
import type { Capabilities } from "../runtime/capabilities.ts";
import { cliBuiltinCompletionGroup } from "./completion/group.ts";
import { cliBuiltinHttpCommand } from "./http.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";

type BuiltinFactory = (program: AppSpec) => Command | null;

function pushBuiltin(builtins: Command[], program: AppSpec, factory: BuiltinFactory | null): void {
  if (!factory) {
    return;
  }
  const node = factory(program);
  if (node) {
    builtins.push(node);
  }
}

/** Capability-gated built-in command nodes in stable order (parse, help, export). */
export function resolveBuiltins(program: AppSpec, caps: Capabilities): Command[] {
  const builtins: Command[] = [];
  if (caps.completion) {
    pushBuiltin(builtins, program, (p) => cliBuiltinCompletionGroup(p));
  }
  pushBuiltin(builtins, program, () => cliBuiltinVersionCommand());
  if (caps.mcp) {
    pushBuiltin(builtins, program, (p) => cliBuiltinMcpCommand(p));
  }
  if (caps.http) {
    pushBuiltin(builtins, program, (p) => cliBuiltinHttpCommand(p));
  }
  return builtins;
}

/** Top-level `version` built-in (leaf). */
export function cliBuiltinVersionCommand(): RunnableCommand {
  return {
    key: "version",
    description: "Print the program version.",
    handler: () => {},
  };
}
