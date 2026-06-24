import type { CliCapabilities } from "../capabilities.ts";
import { cliBuiltinDocsGroupIfEnabled } from "../docs/builtin.ts";
import type { CliNode, CliProgram } from "../types.ts";
import { cliBuiltinCompletionGroup } from "./completion-group.ts";
import { cliBuiltinConfigGroupIfEnabled } from "./config.ts";
import { cliBuiltinInstallCommand } from "./install.ts";
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
  pushBuiltin(builtins, program, (p) => cliBuiltinCompletionGroup(p));
  pushBuiltin(builtins, program, () => cliBuiltinVersionCommand());
  if (caps.install) {
    pushBuiltin(builtins, program, (p) => cliBuiltinInstallCommand(p));
  }
  pushBuiltin(builtins, program, (p) => cliBuiltinDocsGroupIfEnabled(p) ?? null);
  if (caps.mcp) {
    pushBuiltin(builtins, program, (p) => cliBuiltinMcpCommand(p));
  }
  pushBuiltin(builtins, program, (p) => cliBuiltinConfigGroupIfEnabled(p) ?? null);
  return builtins;
}
