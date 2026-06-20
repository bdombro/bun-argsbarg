import { CliCommand, CliFallbackMode, CliOption, CliPositional } from "../types.ts";
import { cliBuiltinCompletionGroup } from "./completion-group.ts";
import { cliBuiltinInstallCommand } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { isCompiledExecutable } from "../install/compiled.ts";

/** JSON-safe command node (no handlers). */
export interface CliSchemaExport {
  key: string;
  description: string;
  notes?: string;
  options?: CliOption[];
  fallbackCommand?: string;
  fallbackMode?: CliFallbackMode;
  commands?: CliSchemaExport[];
  positionals?: CliPositional[];
}

function exportBuiltinNode(cmd: CliCommand): CliSchemaExport {
  const out: CliSchemaExport = {
    key: cmd.key,
    description: cmd.description,
  };
  if ((cmd.notes ?? "").length > 0) {
    out.notes = cmd.notes;
  }
  if ((cmd.options ?? []).length > 0) {
    out.options = cmd.options;
  }
  if ((cmd.commands ?? []).length > 0) {
    out.commands = (cmd.commands ?? []).map((ch) => exportBuiltinNode(ch));
  }
  return out;
}

/** Built-in subtrees matching help visibility for `--schema` export. */
export function exportPresentationBuiltins(root: CliCommand): CliSchemaExport[] {
  const builtins: CliSchemaExport[] = [exportBuiltinNode(cliBuiltinCompletionGroup(root.key))];
  if (isCompiledExecutable() && root.install?.enabled !== false) {
    builtins.push(exportBuiltinNode(cliBuiltinInstallCommand(root)));
  }
  if (root.mcpServer !== undefined) {
    builtins.push(exportBuiltinNode(cliBuiltinMcpCommand()));
  }
  return builtins;
}
