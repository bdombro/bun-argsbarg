import type { AppSpec, Command, CommandOption, CommandPositional, FallbackMode } from "../core/types.ts";
import { hasSubcommands } from "../core/types.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";
import { isCliSchemaHidden, visibleOptions } from "../runtime/exposure.ts";
import { resolveBuiltins } from "./registry.ts";

/** JSON-safe command node (no handlers). */
export interface SchemaExport {
  key: string;
  description: string;
  notes?: string;
  /** JSON Schema for input arguments (options, positionals, or document body) when on a leaf. */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema for structured stdout when set on the leaf. */
  outputSchema?: Record<string, unknown>;
  /** Default success Content-Type when `outputSchema` is omitted but `http.successContentType` is set. */
  outputContentType?: string;
  options?: readonly CommandOption[];
  fallbackCommand?: string;
  fallbackMode?: FallbackMode;
  commands?: SchemaExport[];
  positionals?: readonly CommandPositional[];
}

function exportBuiltinNode(cmd: Command): SchemaExport | null {
  if (isCliSchemaHidden(cmd)) {
    return null;
  }

  const out: SchemaExport = {
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
  if (hasSubcommands(cmd)) {
    if (cmd.fallbackCommand !== undefined) {
      out.fallbackCommand = cmd.fallbackCommand;
    }
    if (cmd.fallbackMode !== undefined) {
      out.fallbackMode = cmd.fallbackMode;
    }
    const children = cmd.commands.map((ch) => exportBuiltinNode(ch)).filter((ch): ch is SchemaExport => ch !== null);
    if (children.length > 0) {
      out.commands = children;
    }
  }
  return out;
}

/** Built-in subtrees matching help visibility for `--schema` export. */
export function exportPresentationBuiltins(program: AppSpec): SchemaExport[] {
  const caps = resolveCapabilities(program);
  return resolveBuiltins(program, caps)
    .map((cmd) => exportBuiltinNode(cmd))
    .filter((node): node is SchemaExport => node !== null);
}
