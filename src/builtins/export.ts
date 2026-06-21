import { type CliCapabilities, resolveCapabilities } from "../capabilities.ts";
import type { CliFallbackMode, CliOption, CliPositional, CliProgram } from "../types.ts";
import { cliBuiltinCompletionGroup } from "./completion-group.ts";
import { cliBuiltinInstallCommand } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliBuiltinVersionCommand } from "./version.ts";
import { cliBuiltinDocsGroupIfEnabled } from "../docs/builtin.ts";

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

function exportBuiltinNode(cmd: {
  key: string;
  description: string;
  notes?: string;
  options?: CliOption[];
  commands?: CliSchemaExport[];
}): CliSchemaExport {
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
export function exportPresentationBuiltins(program: CliProgram, caps?: CliCapabilities): CliSchemaExport[] {
  const resolved = caps ?? resolveCapabilities(program);
  const builtins: CliSchemaExport[] = [
    exportBuiltinNode(cliBuiltinCompletionGroup(program)),
    exportBuiltinNode(cliBuiltinVersionCommand()),
  ];
  if (resolved.install) {
    builtins.push(exportBuiltinNode(cliBuiltinInstallCommand(program)));
  }
  const docsGroup = cliBuiltinDocsGroupIfEnabled(program);
  if (docsGroup) {
    builtins.push(exportBuiltinNode(docsGroup));
  }
  if (resolved.mcp) {
    builtins.push(exportBuiltinNode(cliBuiltinMcpCommand(program)));
  }
  return builtins;
}
