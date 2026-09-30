/*
This module renders CLI help as plain text: section rules, wrapped two-column tables, and
(when output is not a TTY) in-band YAML-style input and output schemas for agent discovery.
Output has no color and no box borders, so it copies cleanly and reads the same everywhere.

It keeps help formatting shared across help and error paths so users see one consistent
style no matter how help is reached.
*/

import {
  type Command,
  type CommandGroup,
  type CommandOption,
  type CommandPositional,
  hasHandler,
  hasSubcommands,
  isDocumentCommand,
  leafInputSchema,
  leafOutputSchema,
  OptionKind,
  type RunnableCommand,
} from "../core/types.ts";
import { visibleOptions, visibleSubcommands } from "./exposure.ts";

/** Horizontal rule character used in section headers. */
const kRuleH = "\u2500"; // ─

// ── Terminal Detection ────────────────────────────────────────────────────────

/** Returns a minimum column width for help, clamped to stdout width when known. */
function getHelpWidth(): number {
  return Math.max(40, process.stdout.columns || 80);
}

/** True when stdout/stderr is a TTY (used to decide whether schemas show by default). */
function isOutputTTY(useStderr: boolean): boolean {
  return useStderr ? !!process.stderr.isTTY : !!process.stdout.isTTY;
}

// ── Width Helpers ─────────────────────────────────────────────────────────────

/** Returns a string of `n` spaces. */
function spaces(n: number): string {
  return " ".repeat(Math.max(0, n));
}

/** Pads `s` with trailing spaces to `width` columns. */
function padEnd(s: string, width: number): string {
  return s + spaces(width - s.length);
}

// ── Text Wrapping ─────────────────────────────────────────────────────────────

/** Word-wraps a single line of text to a maximum `width` in columns. */
function wrapParagraph(text: string, width: number): string[] {
  const available = Math.max(1, width);
  const out: string[] = [];
  let cur = "";

  for (const word of text.split(/\s+/).filter((w) => w.length > 0)) {
    if (cur.length === 0) {
      cur = word;
      continue;
    }
    if (cur.length + 1 + word.length <= available) {
      cur += ` ${word}`;
    } else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** Splits on newlines and wraps each logical line, preserving intentional leading-indent lines. */
function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.trim().length === 0) {
      out.push("");
      continue;
    }
    if (line[0] === " " || line[0] === "\t") {
      out.push(line);
      continue;
    }
    out.push(...wrapParagraph(line, width));
  }
  if (out.length === 0) out.push("");
  return out;
}

// ── Option Label Formatting ───────────────────────────────────────────────────

/** Suffix for `--name` in usage (e.g. ` <string>`) based on value kind. */
function optKindLabel(k: OptionKind, o?: CommandOption): string {
  switch (k) {
    case OptionKind.Presence:
      return "";
    case OptionKind.Number:
      return " <number>";
    case OptionKind.String:
      return " <string>";
    case OptionKind.Enum: {
      const choices = o?.choices ?? [];
      if (choices.length === 0) {
        return " <choice>";
      }
      if (choices.length <= 4) {
        return ` <${choices.join("|")}>`;
      }
      return ` <${choices.slice(0, 3).join("|")}|…>`;
    }
    case OptionKind.Json:
      return " <json>";
  }
}

/** Formats a flag/value option for help tables: `--name`, optional short, optional kind hint. */
export function cliOptionLabel(o: CommandOption): string {
  let r = `--${o.name}${optKindLabel(o.kind, o)}`;
  if (o.shortName) r += `, -${o.shortName}`;
  return r;
}

/** Placeholder in `notes` for the root program key (resolved in help and schema export). */
export const CLI_NOTES_PROGRAM = "{argsbarg:program}";

/** Replaces `{argsbarg:program}` in notes/help text with the program key. */
export function cliResolveNotes(notes: string, appKey: string): string {
  return notes.replaceAll(CLI_NOTES_PROGRAM, appKey);
}

/** Formats a positional slot label (`<n>`, `[n]`, or varargs) for help. */
export function cliPositionalLabel(p: CommandPositional): string {
  const { argMin = 1, argMax = 1 } = p;
  let r: string;
  if (argMax === 1) {
    r = argMin === 0 ? `[${p.name}]` : `<${p.name}>`;
  } else {
    r = argMin === 0 ? `[${p.name}...]` : `<${p.name}...>`;
  }
  return r;
}

// ── Section Rendering ────────────────────────────────────────────────────────

/** A single help table row: left column text and right-column description. */
interface HelpRow {
  /** Option flag or subcommand / positional label. */
  label: string;
  /** Explanatory text (may be wrapped to multiple display lines). */
  description: string;
}

/** Section header rule: `── Title ────…` filling `hw` columns. */
function sectionRule(
  /** Section title (e.g. "Usage" or "Options"). */
  title: string,
  /** Available terminal column width. */
  hw: number,
): string {
  const lead = `${kRuleH}${kRuleH} ${title} `;
  return lead + kRuleH.repeat(Math.max(2, hw - lead.length));
}

/** Renders a section: header rule, then 2-space indented lines. */
function renderSection(
  /** Section title (e.g. "Usage" or "Notes"). */
  title: string,
  /** Content lines to indent under the header. */
  lines: string[],
  /** Available terminal column width. */
  hw: number,
): string[] {
  if (lines.length === 0) return [];
  const out: string[] = [sectionRule(title, hw)];
  for (const line of lines) {
    out.push(line.length > 0 ? `  ${line}` : "");
  }
  return out;
}

/** Renders a section with a two-column label/description table (options, subcommands, positionals). */
function renderTable(
  /** Section title (e.g. "Options" or "Subcommands"). */
  title: string,
  /** Rows with label and description to format. */
  rows: HelpRow[],
  /** Available terminal column width. */
  hw: number,
): string[] {
  if (rows.length === 0) return [];
  let labelWidth = 0;
  for (const row of rows) {
    labelWidth = Math.max(labelWidth, row.label.length);
  }
  const descWidth = Math.max(20, hw - labelWidth - 4);
  const out: string[] = [sectionRule(title, hw)];
  for (const row of rows) {
    const wrapped = wrapText(row.description, descWidth);
    if (wrapped.length === 0 || wrapped[0].length === 0) {
      out.push(`  ${row.label}`);
    } else {
      out.push(`  ${padEnd(row.label, labelWidth)}  ${wrapped[0]}`);
      for (let idx = 1; idx < wrapped.length; idx++) {
        out.push(`  ${spaces(labelWidth)}  ${wrapped[idx]}`);
      }
    }
  }
  return out;
}

// ── Usage & Rows ──────────────────────────────────────────────────────────────

/** Builds one or two usage line strings (OPTIONS / COMMAND / ARGS) for the help header. */
function usageLines(
  appName: string,
  helpPath: string[],
  hasCommands: boolean,
  hasArgs: boolean,
  documentLeaf: boolean,
  leafKind?: string,
): string[] {
  let fullPath = appName;
  for (const seg of helpPath) {
    fullPath += ` ${seg}`;
  }
  const usageOpts = "[OPTIONS]";
  const usageCmd = "COMMAND";
  const usageArgs = "[ARGS]...";
  const usageDoc = leafKind === "document" ? "[DOCUMENT]" : "[JSON]";

  const out: string[] = [];
  if (helpPath.length === 0) {
    if (hasCommands) {
      out.push(`${fullPath} ${usageOpts} ${usageCmd} ${usageArgs}`);
    } else {
      out.push(`${fullPath} ${usageOpts}`);
    }
    return out;
  }
  if (documentLeaf) {
    out.push(`${fullPath} ${usageDoc}`);
    return out;
  }
  out.push(`${fullPath} ${usageOpts}${hasArgs ? ` ${usageArgs}` : ""}`);
  if (hasCommands) {
    out.push(`${fullPath} ${usageCmd} ${usageArgs}`);
  }
  return out;
}

/** Table rows for `kind: "document"` leaf input (schema properties + stdin hint). */
function rowsForJsonInput(inputSchema: Record<string, unknown> | undefined, kind?: string): HelpRow[] {
  const hint = "Pass a JSON document as an argument or pipe to stdin.";
  const label = kind === "document" ? "DOCUMENT" : "JSON";
  const rows: HelpRow[] = [{ label, description: hint }];
  const props = inputSchema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return rows;
  }
  const required = new Set(Array.isArray(inputSchema?.required) ? inputSchema.required.map((k) => String(k)) : []);
  for (const [name, prop] of Object.entries(props as Record<string, { description?: string }>)) {
    const desc = prop.description ?? "";
    rows.push({
      label: name,
      description: required.has(name) ? `(required) ${desc}` : desc,
    });
  }
  return rows;
}

/** Table rows for named options, including synthetic built-in rows. */
function rowsForOptions(defs: readonly CommandOption[]): HelpRow[] {
  const rows: HelpRow[] = [];
  rows.push({ label: "--help, -h", description: "Show help for this command." });
  for (const o of defs) {
    const desc = o.required ? `(required) ${o.description}` : o.description;
    rows.push({ label: cliOptionLabel(o), description: desc });
  }
  return rows;
}

/** Table rows for positional `CommandPositional` definitions. */
function rowsForPositionals(defs: readonly CommandPositional[]): HelpRow[] {
  return defs.map((p) => ({ label: cliPositionalLabel(p), description: p.description }));
}

/** Table rows for subcommands, sorted by key (hidden commands omitted). */
function rowsForSubcommands(cmds: Command[]): HelpRow[] {
  return visibleSubcommands(cmds)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((c) => ({ label: c.key, description: c.description }));
}

// ── Schema YAML Formatting ───────────────────────────────────────────────────

/**
 * Resolves a JSON Schema $ref pointer from definitions or $defs.
 */
function resolveRef(
  /** Reference URI string (e.g. `#/definitions/Foo` or `#/$defs/Foo`). */
  ref: string,
  /** Definitions dictionary from the root schema. */
  defs: Record<string, unknown>,
): Record<string, unknown> | null {
  const name = ref.replace(/^#\/(definitions|\$defs)\//, "");
  const target = defs[name];
  if (typeof target === "object" && target !== null) {
    return target as Record<string, unknown>;
  }
  return null;
}

/**
 * Formats a single-line type representation from a JSON Schema fragment.
 * Returns null if the type is complex and requires multiline YAML formatting.
 */
function formatType(
  /** Schema fragment to inspect. */
  schema: Record<string, unknown>,
  /** Schema definitions for reference lookup. */
  defs: Record<string, unknown>,
  /** Ancestor reference names visited in the current descent. */
  seen: Set<string>,
): string | null {
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.replace(/^#\/(definitions|\$defs)\//, "");
    if (seen.has(name)) {
      return name;
    }
    seen.add(name);
    const resolved = resolveRef(schema.$ref, defs);
    const res = resolved ? formatType(resolved, defs, seen) : name;
    seen.delete(name);
    return res;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((v) => (typeof v === "string" ? JSON.stringify(v) : String(v))).join(" | ");
  }

  const union = (schema.anyOf ?? schema.oneOf) as unknown[];
  if (Array.isArray(union) && union.length > 0) {
    const parts: string[] = [];
    let allSimple = true;
    for (const variant of union) {
      if (typeof variant === "object" && variant !== null) {
        const formatted = formatType(variant as Record<string, unknown>, defs, seen);
        if (formatted !== null) {
          parts.push(formatted);
        } else {
          allSimple = false;
          break;
        }
      }
    }
    if (allSimple && parts.length > 0) {
      return parts.join(" | ");
    }
  }

  if (Array.isArray(schema.type)) {
    return schema.type.join(" | ");
  }

  if (schema.type === "string") {
    if (typeof schema.format === "string") {
      return `string (${schema.format})`;
    }
    return "string";
  }

  if (schema.type === "number") return "number";
  if (schema.type === "integer") return "integer";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "null") return "null";

  if (schema.type === "array" && schema.items && typeof schema.items === "object") {
    const itemType = formatType(schema.items as Record<string, unknown>, defs, seen);
    if (itemType !== null) {
      if (itemType.includes(" | ")) {
        return `(${itemType})[]`;
      }
      return `${itemType}[]`;
    }
    return null;
  }

  if (schema.type === "object" || schema.properties !== undefined) {
    if (schema.properties && typeof schema.properties === "object" && Object.keys(schema.properties).length > 0) {
      return null;
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      const valType = formatType(schema.additionalProperties as Record<string, unknown>, defs, seen) ?? "object";
      return `{ [key: string]: ${valType} }`;
    }
    return "object";
  }

  return null;
}

/**
 * Formats a JSON Schema node into multiline YAML lines with JSDoc comments.
 */
function formatSchemaLines(
  /** Schema object to format. */
  schema: Record<string, unknown>,
  /** Schema definitions dictionary. */
  defs: Record<string, unknown>,
  /** Indentation level in spaces. */
  indent: number,
  /** Ancestor reference names visited in the current descent. */
  seen: Set<string>,
): string[] {
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.replace(/^#\/(definitions|\$defs)\//, "");
    if (seen.has(name)) {
      return [`${spaces(indent)}${name}`];
    }
    seen.add(name);
    const resolved = resolveRef(schema.$ref, defs);
    const res = resolved ? formatSchemaLines(resolved, defs, indent, seen) : [`${spaces(indent)}${name}`];
    seen.delete(name);
    return res;
  }

  if (schema.type === "object" || schema.properties !== undefined) {
    const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    const required = new Set(Array.isArray(schema.required) ? schema.required.map((k) => String(k)) : []);
    const propEntries = Object.entries(props);
    if (propEntries.length === 0) {
      const simple = formatType(schema, defs, seen);
      return simple ? [`${spaces(indent)}${simple}`] : [`${spaces(indent)}{}`];
    }

    const lines: string[] = [];
    for (const [key, prop] of propEntries) {
      if (typeof prop !== "object" || prop === null) continue;
      const desc = typeof prop.description === "string" ? prop.description.trim() : "";
      if (desc.length > 0) {
        for (const dLine of desc.split("\n")) {
          lines.push(`${spaces(indent)}# ${dLine.trim()}`);
        }
      }
      const isReq = required.has(key);
      const keyStr = isReq ? key : `${key}?`;
      const simple = formatType(prop, defs, seen);
      if (simple !== null) {
        lines.push(`${spaces(indent)}${keyStr}: ${simple}`);
      } else {
        if (prop.type === "array" && prop.items && typeof prop.items === "object") {
          lines.push(`${spaces(indent)}${keyStr}:`);
          const itemSchema = prop.items as Record<string, unknown>;
          const itemLines = formatSchemaLines(itemSchema, defs, 0, seen);
          if (itemLines.length > 0) {
            lines.push(`${spaces(indent + 2)}- ${itemLines[0]}`);
            for (let i = 1; i < itemLines.length; i++) {
              lines.push(`${spaces(indent + 4)}${itemLines[i]}`);
            }
          } else {
            lines.push(`${spaces(indent + 2)}- {}`);
          }
        } else {
          lines.push(`${spaces(indent)}${keyStr}:`);
          const childLines = formatSchemaLines(prop, defs, indent + 2, seen);
          lines.push(...childLines);
        }
      }
    }
    return lines;
  }

  if (schema.type === "array") {
    if (schema.items && typeof schema.items === "object") {
      const itemSchema = schema.items as Record<string, unknown>;
      const simple = formatType(itemSchema, defs, seen);
      if (simple !== null) {
        return [`${spaces(indent)}- ${simple}`];
      }
      const itemLines = formatSchemaLines(itemSchema, defs, 0, seen);
      if (itemLines.length > 0) {
        const out: string[] = [`${spaces(indent)}- ${itemLines[0]}`];
        for (let i = 1; i < itemLines.length; i++) {
          out.push(`${spaces(indent + 2)}${itemLines[i]}`);
        }
        return out;
      }
      return [`${spaces(indent)}- {}`];
    }
    return [`${spaces(indent)}array`];
  }

  const fallback = formatType(schema, defs, seen);
  return fallback ? [`${spaces(indent)}${fallback}`] : [`${spaces(indent)}object`];
}

/**
 * Converts a JSON Schema object into human-readable, agent-friendly YAML lines.
 */
export function schemaToYamlLines(
  /** JSON Schema object to format. */
  schema: Record<string, unknown>,
  /** Starting indentation column in spaces (default 0). */
  indent = 0,
): string[] {
  const defs = ((schema.definitions ?? schema.$defs) as Record<string, unknown>) ?? {};
  const lines: string[] = [];
  if (typeof schema.description === "string" && schema.description.trim().length > 0) {
    for (const dLine of schema.description.trim().split("\n")) {
      lines.push(`${spaces(indent)}# ${dLine.trim()}`);
    }
  }
  lines.push(...formatSchemaLines(schema, defs, indent, new Set<string>()));
  return lines;
}

// ── Main Help Render ──────────────────────────────────────────────────────────

/**
 * Optional rendering options for CLI help output.
 */
export interface CliHelpRenderOptions {
  /** Override TTY detection for testing or headless environments. */
  isTTY?: boolean;
  /** Force schema display in TTY mode (always included by default in non-TTY). */
  showSchema?: boolean;
}

/** Appends the notes section to `lines` (placeholders resolved, wrapped to `hw`). */
function appendNotes(
  /** Accumulator lines for help output. */
  lines: string[],
  /** Raw notes text from schema. */
  notes: string | undefined,
  /** App spec key for placeholder resolution. */
  appKey: string,
  /** Available terminal width. */
  hw: number,
): void {
  if ((notes ?? "").length === 0) {
    return;
  }
  const resolved = cliResolveNotes(notes ?? "", appKey);
  lines.push("");
  lines.push(renderSection("Notes", wrapText(resolved, hw - 4), hw).join("\n"));
}

/** Appends a section to `lines` after a blank line when it has content. */
function appendBlock(
  /** Accumulator lines for help output. */
  lines: string[],
  /** Rendered section lines (empty to skip). */
  block: string[],
): void {
  if (block.length > 0) {
    lines.push("");
    lines.push(block.join("\n"));
  }
}

/** Appends an output schema section for a runnable command, when it declares one. */
function appendOutputSchema(
  /** Accumulator lines for help output. */
  lines: string[],
  /** Runnable command whose `outputSchema` to render. */
  leaf: RunnableCommand,
  /** Available terminal width. */
  hw: number,
): void {
  const output = leafOutputSchema(leaf);
  if (output === undefined) return;
  const title = isDocumentCommand(leaf) ? "Output Schema (JSON)" : "Output Schema (with --json)";
  appendBlock(lines, renderSection(title, schemaToYamlLines(output, 0), hw));
}

/**
 * Renders full help for the app root or a nested command, following `helpPath` from the root key.
 * Output is plain text with section rules. Schema sections are included by default only when output
 * is not a TTY (agents get full schemas; humans get short help).
 */
export function cliHelpRender(
  /** Root command presentation schema. */
  schema: CommandGroup,
  /** Segment path to the target command node. */
  helpPath: string[],
  /** Whether output will be directed to stderr. */
  useStderr: boolean,
  /** Optional rendering overrides. */
  opts?: CliHelpRenderOptions,
): string {
  const hw = getHelpWidth();
  const isTTY = opts?.isTTY ?? isOutputTTY(useStderr);
  const showSchema = opts?.showSchema ?? !isTTY;

  if (helpPath.length === 0) {
    const lines: string[] = [];
    lines.push("");
    if (schema.description.length > 0) {
      lines.push(schema.description);
      lines.push("");
    }
    const usage = usageLines(schema.key, helpPath, (schema.commands ?? []).length > 0, false, false);
    lines.push(renderSection("Usage", usage, hw).join("\n"));
    appendBlock(lines, renderTable("Options", rowsForOptions(visibleOptions(schema.options)), hw));
    if ((schema.commands ?? []).length > 0) {
      appendBlock(lines, renderTable("Commands", rowsForSubcommands(schema.commands ?? []), hw));
    }
    if (hasHandler(schema as unknown as Command) && showSchema) {
      appendOutputSchema(lines, schema as unknown as RunnableCommand, hw);
    }
    appendNotes(lines, schema.notes, schema.key, hw);
    return `${lines.join("\n")}\n\n`;
  }

  let layer = schema.commands ?? [];
  let node: Command | undefined;
  for (const seg of helpPath) {
    const ch = layer.find((c: Command) => c.key === seg);
    if (!ch) {
      return "Unknown help path.\n";
    }
    node = ch;
    layer = hasSubcommands(ch) ? ch.commands : [];
  }
  if (!node) {
    return "Unknown help path.\n";
  }

  const lines: string[] = [];
  lines.push("");
  if (node.description.length > 0) {
    lines.push(node.description);
    lines.push("");
  }
  const nodeIsDocumentLeaf = hasHandler(node) && isDocumentCommand(node);
  const usage = usageLines(
    schema.key,
    helpPath,
    hasSubcommands(node) && node.commands.length > 0,
    hasHandler(node) && (node.positionals ?? []).length > 0,
    nodeIsDocumentLeaf,
    hasHandler(node) ? node.kind : undefined,
  );
  lines.push(renderSection("Usage", usage, hw).join("\n"));

  if (nodeIsDocumentLeaf && hasHandler(node)) {
    const nodeInput = leafInputSchema(node);
    appendBlock(lines, renderTable("Input", rowsForJsonInput(nodeInput, node.kind), hw));
    if (showSchema && nodeInput !== undefined) {
      appendBlock(lines, renderSection("Input Schema", schemaToYamlLines(nodeInput, 0), hw));
    }
  } else {
    appendBlock(lines, renderTable("Options", rowsForOptions(visibleOptions(node.options)), hw));
    appendBlock(
      lines,
      renderTable("Arguments", rowsForPositionals(hasHandler(node) ? (node.positionals ?? []) : []), hw),
    );
  }

  appendBlock(lines, renderTable("Subcommands", rowsForSubcommands(hasSubcommands(node) ? node.commands : []), hw));

  if (hasHandler(node) && showSchema) {
    appendOutputSchema(lines, node, hw);
  }

  appendNotes(lines, node.notes, schema.key, hw);

  return `${lines.join("\n")}\n\n`;
}
