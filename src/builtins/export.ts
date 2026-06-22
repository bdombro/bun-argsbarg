import { type CliCapabilities, resolveCapabilities } from "../capabilities.ts";
import { cliBuiltinDocsGroupIfEnabled } from "../docs/builtin.ts";
import { visibleOptions } from "../hidden.ts";
import type { CliFallbackMode, CliNode, CliOption, CliPositional, CliProgram } from "../types.ts";
import { isCliRouter } from "../types.ts";
import { cliBuiltinCompletionGroup } from "./completion-group.ts";
import { cliBuiltinInstallCommand } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliBuiltinVersionCommand } from "./version.ts";

/** JSON-safe command node (no handlers). */
export interface CliSchemaExport {
  key: string;
  description: string;
  notes?: string;
  /** JSON Schema for structured stdout when set on the leaf `mcpTool`. */
  outputSchema?: Record<string, unknown>;
  options?: CliOption[];
  fallbackCommand?: string;
  fallbackMode?: CliFallbackMode;
  commands?: CliSchemaExport[];
  positionals?: CliPositional[];
}

function exportBuiltinNode(cmd: CliNode): CliSchemaExport | null {
  if (cmd.hidden) {
    return null;
  }

  const out: CliSchemaExport = {
    key: cmd.key,
    description: cmd.description,
  };
  if ((cmd.notes ?? "").length > 0) {
    out.notes = cmd.notes;
  }
  const options = visibleOptions(cmd.options);
  if (options.length > 0) {
    out.options = options;
  }
  if (isCliRouter(cmd)) {
    if (cmd.fallbackCommand !== undefined) {
      out.fallbackCommand = cmd.fallbackCommand;
    }
    if (cmd.fallbackMode !== undefined) {
      out.fallbackMode = cmd.fallbackMode;
    }
    const children = cmd.commands
      .map((ch) => exportBuiltinNode(ch))
      .filter((ch): ch is CliSchemaExport => ch !== null);
    if (children.length > 0) {
      out.commands = children;
    }
  }
  return out;
}

function pushExportedBuiltin(builtins: CliSchemaExport[], cmd: CliNode): void {
  const node = exportBuiltinNode(cmd);
  if (node) {
    builtins.push(node);
  }
}

/** Built-in subtrees matching help visibility for `--schema` export. */
export function exportPresentationBuiltins(
  program: CliProgram,
  caps?: CliCapabilities,
): CliSchemaExport[] {
  const resolved = caps ?? resolveCapabilities(program);
  const builtins: CliSchemaExport[] = [];
  pushExportedBuiltin(builtins, cliBuiltinCompletionGroup(program));
  pushExportedBuiltin(builtins, cliBuiltinVersionCommand());
  if (resolved.install) {
    pushExportedBuiltin(builtins, cliBuiltinInstallCommand(program));
  }
  const docsGroup = cliBuiltinDocsGroupIfEnabled(program);
  if (docsGroup) {
    pushExportedBuiltin(builtins, docsGroup);
  }
  if (resolved.mcp) {
    pushExportedBuiltin(builtins, cliBuiltinMcpCommand(program));
  }
  return builtins;
}
