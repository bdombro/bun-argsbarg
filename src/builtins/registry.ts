import type { CliCapabilities } from "../capabilities.ts";
import { cliBuiltinDocsGroupIfEnabled } from "../docs/builtin.ts";
import type { CliNode, CliProgram } from "../types.ts";
import { cliBuiltinCompletionGroup } from "./completion-group.ts";
import { cliBuiltinConfigureCommand } from "./configure.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliBuiltinVersionCommand } from "./version.ts";

type BuiltinFactory = (program: CliProgram) => CliNode | null;

function pushBuiltin(
  builtins: CliNode[],
  program: CliProgram,
  factory: BuiltinFactory | null,
): void {
  if (!factory) {
    return;
  }
  const node = factory(program);
  if (node) {
    builtins.push(node);
  }
}

/** Capability-gated built-in command nodes in stable order (parse, help, export). */
export function resolveBuiltins(program: CliProgram, caps: CliCapabilities): CliNode[] {
  const builtins: CliNode[] = [];
  if (caps.completion) {
    pushBuiltin(builtins, program, (p) => cliBuiltinCompletionGroup(p));
  }
  pushBuiltin(builtins, program, () => cliBuiltinVersionCommand());
  if (caps.configure) {
    pushBuiltin(builtins, program, (p) => cliBuiltinConfigureCommand(p));
  }
  pushBuiltin(builtins, program, (p) => cliBuiltinDocsGroupIfEnabled(p) ?? null);
  if (caps.mcp) {
    pushBuiltin(builtins, program, (p) => cliBuiltinMcpCommand(p));
  }
  return builtins;
}
