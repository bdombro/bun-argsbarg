/*
This module renders CLI help with wrapping, boxes, tables, and TTY color for interactive
terminal sessions, as well as clean unboxed plain text with in-band YAML input and output
schemas for non-TTY agent discovery and piping.

It keeps help formatting shared across help and error paths so users see one consistent
style no matter how help is reached.
*/

import {
  type CliLeaf,
  type CliNode,
  type CliOption,
  CliOptionKind,
  type CliPositional,
  type CliRouter,
  isCliLeaf,
  isCliRouter,
  isJsonLeaf,
} from "./core/types.ts";
import { visibleOptions, visibleSubcommands } from "./runtime/exposure.ts";

// ── ANSI Style Helpers ────────────────────────────────────────────────────────

/** SGR wrappers for TTY help output. */
const style = {
  /** Joins a message with a prefix and a reset (or suffix) for ANSI SGR. */
  wrap(prefix: string, body: string, suffix: string): string {
    return prefix + body + suffix;
  },
  /** Renders the message in red. */
  red(msg: string): string {
    return this.wrap("\u001B[31m", msg, "\u001B[0m");
  },
  /** Renders the message in gray. */
  gray(msg: string): string {
    return this.wrap("\u001B[90m", msg, "\u001B[0m");
  },
  /** Renders the message in bold. */
  bold(msg: string): string {
    return this.wrap("\u001B[1m", msg, "\u001B[0m");
  },
  /** Renders the message in white. */
  white(msg: string): string {
    return this.wrap("\u001B[37m", msg, "\u001B[0m");
  },
  /** Renders the message in bright aqua + bold. */
  aquaBold(msg: string): string {
    return this.wrap("\u001B[96m\u001B[1m", msg, "\u001B[0m");
  },
  /** Renders the message in bright green. */
  greenBright(msg: string): string {
    return this.wrap("\u001B[92m", msg, "\u001B[0m");
  },
  /** Renders a section title: gray and bold. */
  grayBoldTitle(title: string): string {
    return this.gray(this.bold(title));
  },
};

// ── Unicode Box Drawing Characters ────────────────────────────────────────────

const kBoxTL = "\u256D"; // ╭
const kBoxTR = "\u256E"; // ╮
const kBoxV = "\u2502"; // │
const kBoxBL = "\u2570"; // ╰
const kBoxBR = "\u256F"; // ╯
const kBoxH = "\u2500"; // ─

// ── Terminal Detection ────────────────────────────────────────────────────────

/** Returns a minimum column width for help, clamped to stdout width when known. */
function getHelpWidth(): number {
  return Math.max(40, process.stdout.columns || 80);
}

/** True when stdout/stderr is a TTY (used to decide on boxes and color). */
function isOutputTTY(useStderr: boolean): boolean {
  return useStderr ? !!process.stderr.isTTY : !!process.stdout.isTTY;
}

// ── Width Helpers ─────────────────────────────────────────────────────────────

/** Counts display columns, skipping ANSI SGR sequences. */
function visibleWidth(s: string): number {
  let w = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\u001B" && i + 1 < s.length && s[i + 1] === "[") {
      i += 2;
      while (i < s.length && s[i] !== "m") {
        i += 1;
      }
      if (i < s.length) i += 1;
      continue;
    }
    w += 1;
    i += 1;
  }
  return w;
}

/** Repeats the horizontal box-drawing character `n` times. */
function repeatBoxH(n: number): string {
  return kBoxH.repeat(Math.max(0, n));
}

/** Returns a string of `n` spaces. */
function spaces(n: number): string {
  return " ".repeat(Math.max(0, n));
}

/** Pads `s` to visible width (ANSI-aware) to `width` columns. */
function padVisible(s: string, width: number): string {
  return s + spaces(Math.max(0, width - visibleWidth(s)));
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
function optKindLabel(k: CliOptionKind, o?: CliOption): string {
  switch (k) {
    case CliOptionKind.Presence:
      return "";
    case CliOptionKind.Number:
      return " <number>";
    case CliOptionKind.String:
      return " <string>";
    case CliOptionKind.Enum: {
      const choices = o?.choices ?? [];
      if (choices.length === 0) {
        return " <choice>";
      }
      if (choices.length <= 4) {
        return ` <${choices.join("|")}>`;
      }
      return ` <${choices.slice(0, 3).join("|")}|…>`;
    }
    case CliOptionKind.Json:
      return " <json>";
  }
}

/** Formats a flag/value option for help tables: `--name`, optional short, optional kind hint. */
export function cliOptionLabel(o: CliOption, color: boolean): string {
  let r = `--${o.name}${optKindLabel(o.kind, o)}`;
  if (o.shortName) r += `, -${o.shortName}`;
  if (!color) return r;

  const sepIdx = r.indexOf(", ");
  if (sepIdx === -1) return style.aquaBold(r);
  const left = r.slice(0, sepIdx);
  const right = r.slice(sepIdx + 2);
  return `${style.aquaBold(left)} ${style.greenBright(right)}`;
}

/** Placeholder in `notes` for the root program key (resolved in help, schema, and docs cli). */
export const CLI_NOTES_PROGRAM = "{argsbarg:program}";

/** Replaces `{argsbarg:program}` in notes/help text with the program key. */
export function cliResolveNotes(notes: string, appKey: string): string {
  return notes.replaceAll(CLI_NOTES_PROGRAM, appKey);
}

/** Formats a positional slot label (`<n>`, `[n]`, or varargs) for help. */
export function cliPositionalLabel(p: CliPositional, color: boolean): string {
  const { argMin = 1, argMax = 1 } = p;
  let r: string;
  if (argMax === 1) {
    r = argMin === 0 ? `[${p.name}]` : `<${p.name}>`;
  } else {
    r = argMin === 0 ? `[${p.name}...]` : `<${p.name}...>`;
  }
  if (!color) return r;
  return style.aquaBold(r);
}

// ── Box Rendering ─────────────────────────────────────────────────────────────

/** A single help table row: left column text and right-column description. */
interface HelpRow {
  /** Option flag or subcommand / positional label. */
  label: string;
  /** Explanatory text (may be wrapped to multiple display lines). */
  description: string;
}

/** Renders a free-text or notes box with a Unicode border and `title` header. */
function renderTextBox(title: string, lines: string[], hw: number, color: boolean): string[] {
  if (lines.length === 0) return [];

  const titleLead = color
    ? style.gray(`${kBoxH} `) + style.grayBoldTitle(title) + style.gray(" ")
    : `${kBoxH} ${title} `;

  let contentWidth = visibleWidth(titleLead) + 1;
  for (const line of lines) {
    contentWidth = Math.max(contentWidth, visibleWidth(line));
  }
  contentWidth = Math.max(hw - 2, contentWidth);
  contentWidth = Math.min(contentWidth, hw - 4);

  const borderWidth = contentWidth + 2;
  const headerFill = Math.max(1, borderWidth - visibleWidth(titleLead));

  const out: string[] = [];
  out.push(
    (color ? style.gray(kBoxTL) : kBoxTL) +
      titleLead +
      (color ? style.gray(repeatBoxH(headerFill) + kBoxTR) : repeatBoxH(headerFill) + kBoxTR),
  );

  for (const line of lines) {
    const padded = padVisible(line, contentWidth);
    out.push(`${color ? style.gray(kBoxV) : kBoxV} ${padded} ${color ? style.gray(kBoxV) : kBoxV}`);
  }

  out.push(color ? style.gray(kBoxBL + repeatBoxH(borderWidth) + kBoxBR) : kBoxBL + repeatBoxH(borderWidth) + kBoxBR);

  return out;
}

/** Renders a two-column label/description table in a box (options, subcommands, positionals). */
function renderTableBox(title: string, rows: HelpRow[], hw: number, color: boolean): string[] {
  if (rows.length === 0) return [];

  let labelWidth = 0;
  for (const row of rows) {
    labelWidth = Math.max(labelWidth, visibleWidth(row.label));
  }

  const titleChunk = `${kBoxH} ${title} `;
  const minimumContentWidth = Math.max(visibleWidth(titleChunk) + 1, labelWidth + 2 + 18);
  let contentWidth = Math.max(hw - 2, minimumContentWidth);
  const descWidth = Math.max(1, contentWidth - labelWidth - 2);

  const bodyLines: string[] = [];
  for (const row of rows) {
    const wrapped = wrapText(row.description, descWidth);
    const first = `${row.label + spaces(labelWidth - visibleWidth(row.label))}  ${color ? style.white(wrapped[0]) : wrapped[0]}`;
    bodyLines.push(first);
    for (let idx = 1; idx < wrapped.length; idx++) {
      const pad = color ? style.gray(spaces(labelWidth)) : spaces(labelWidth);
      bodyLines.push(`${pad}  ${color ? style.white(wrapped[idx]) : wrapped[idx]}`);
    }
  }

  let titleLead: string;
  if (color) {
    titleLead = style.gray(`${kBoxH} `) + style.grayBoldTitle(title) + style.gray(" ");
  } else {
    titleLead = `${kBoxH} ${title} `;
  }

  contentWidth = Math.max(contentWidth, visibleWidth(titleLead) + 1);
  for (const line of bodyLines) {
    contentWidth = Math.max(contentWidth, visibleWidth(line));
  }
  contentWidth = Math.min(contentWidth, hw - 4);

  const borderWidth = contentWidth + 2;
  const headerFill = Math.max(1, borderWidth - visibleWidth(titleLead));

  const out: string[] = [];
  out.push(
    (color ? style.gray(kBoxTL) : kBoxTL) +
      titleLead +
      (color ? style.gray(repeatBoxH(headerFill) + kBoxTR) : repeatBoxH(headerFill) + kBoxTR),
  );

  for (const line of bodyLines) {
    const padded = padVisible(line, contentWidth);
    out.push(`${color ? style.gray(kBoxV) : kBoxV} ${padded} ${color ? style.gray(kBoxV) : kBoxV}`);
  }

  out.push(color ? style.gray(kBoxBL + repeatBoxH(borderWidth) + kBoxBR) : kBoxBL + repeatBoxH(borderWidth) + kBoxBR);

  return out;
}

/** Renders a plain-text section with a header and 2-space indented lines (non-TTY). */
function renderPlainSection(
  /** Section header title (e.g. "Usage" or "Notes"). */
  title: string,
  /** Content lines to indent under the header. */
  lines: string[],
): string[] {
  if (lines.length === 0) return [];
  const out: string[] = [`${title}:`];
  for (const line of lines) {
    out.push(line.length > 0 ? `  ${line}` : "");
  }
  return out;
}

/** Renders a plain-text two-column table without box borders (non-TTY). */
function renderPlainTable(
  /** Section header title (e.g. "Options" or "Subcommands"). */
  title: string,
  /** Rows with label and description to format. */
  rows: HelpRow[],
  /** Available terminal width. */
  hw: number,
): string[] {
  if (rows.length === 0) return [];
  let labelWidth = 0;
  for (const row of rows) {
    labelWidth = Math.max(labelWidth, visibleWidth(row.label));
  }
  const descWidth = Math.max(20, hw - labelWidth - 4);
  const out: string[] = [`${title}:`];
  for (const row of rows) {
    const wrapped = wrapText(row.description, descWidth);
    const paddedLabel = padVisible(row.label, labelWidth);
    if (wrapped.length === 0 || wrapped[0].length === 0) {
      out.push(`  ${row.label}`);
    } else {
      out.push(`  ${paddedLabel}  ${wrapped[0]}`);
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
  jsonLeaf: boolean,
  color: boolean,
): string[] {
  let fullPath = appName;
  for (const seg of helpPath) {
    fullPath += ` ${seg}`;
  }
  const usageOpts = color ? style.aquaBold("[OPTIONS]") : "[OPTIONS]";
  const usageCmd = color ? style.aquaBold("COMMAND") : "COMMAND";
  const usageArgs = color ? style.aquaBold("[ARGS]...") : "[ARGS]...";
  const usageJson = color ? style.aquaBold("[JSON]") : "[JSON]";

  const out: string[] = [];
  if (helpPath.length === 0) {
    if (hasCommands) {
      out.push(`${fullPath} ${usageOpts} ${usageCmd} ${usageArgs}`);
    } else {
      out.push(`${fullPath} ${usageOpts}`);
    }
    return out;
  }
  if (jsonLeaf) {
    out.push(`${fullPath} ${usageJson}`);
    return out;
  }
  out.push(`${fullPath} ${usageOpts}${hasArgs ? ` ${usageArgs}` : ""}`);
  if (hasCommands) {
    out.push(`${fullPath} ${usageCmd} ${usageArgs}`);
  }
  return out;
}

/** Table rows for `kind: "json"` leaf input (schema properties + stdin hint). */
function rowsForJsonInput(inputSchema: Record<string, unknown> | undefined): HelpRow[] {
  const hint = "Pass a JSON document as an argument or pipe to stdin.";
  const rows: HelpRow[] = [{ label: "JSON", description: hint }];
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
function rowsForOptions(defs: CliOption[], color: boolean): HelpRow[] {
  const rows: HelpRow[] = [];
  const helpLabel = color ? style.aquaBold("--help, ") + style.greenBright("-h") : "--help, -h";
  rows.push({ label: helpLabel, description: "Show help for this command." });
  for (const o of defs) {
    const desc = o.required ? `(required) ${o.description}` : o.description;
    rows.push({ label: cliOptionLabel(o, color), description: desc });
  }
  return rows;
}

/** Table rows for positional `CliPositional` definitions. */
function rowsForPositionals(defs: CliPositional[], color: boolean): HelpRow[] {
  return defs.map((p) => ({ label: cliPositionalLabel(p, color), description: p.description }));
}

/** Table rows for subcommands, sorted by key (hidden commands omitted). */
function rowsForSubcommands(cmds: CliNode[]): HelpRow[] {
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

/** Appends notes section to lines, using boxes in TTY mode and clean indentation in non-TTY mode. */
function appendNotesBox(
  /** Accumulator lines for help output. */
  lines: string[],
  /** Raw notes text from schema. */
  notes: string | undefined,
  /** Program key for placeholder resolution. */
  appKey: string,
  /** Available terminal width. */
  hw: number,
  /** Whether ANSI color styling is enabled. */
  color: boolean,
  /** Whether output is targeting a TTY terminal. */
  isTTY: boolean,
): void {
  if ((notes ?? "").length === 0) {
    return;
  }
  const resolved = cliResolveNotes(notes ?? "", appKey);
  lines.push("");
  if (isTTY) {
    lines.push(renderTextBox("Notes", wrapText(resolved, hw - 4), hw, color).join("\n"));
  } else {
    lines.push(renderPlainSection("Notes", wrapText(resolved, hw - 4)).join("\n"));
  }
}

/**
 * Renders full help for the app root or a nested command, following `helpPath` from the root key.
 * In TTY mode, renders rounded UTF-8 boxes with ANSI color.
 * In non-TTY mode, strips boxes and borders, and renders full untruncated YAML schemas by default.
 */
export function cliHelpRender(
  /** Root command presentation schema. */
  schema: CliRouter,
  /** Segment path to the target command node. */
  helpPath: string[],
  /** Whether output will be directed to stderr. */
  useStderr: boolean,
  /** Optional rendering overrides. */
  opts?: CliHelpRenderOptions,
): string {
  const hw = getHelpWidth();
  const isTTY = opts?.isTTY ?? isOutputTTY(useStderr);
  const color = isTTY;
  const showSchema = opts?.showSchema ?? !isTTY;

  if (helpPath.length === 0) {
    const lines: string[] = [];
    lines.push("");
    if (schema.description.length > 0) {
      lines.push(color ? style.white(schema.description) : schema.description);
      lines.push("");
    }
    const usage = usageLines(schema.key, helpPath, (schema.commands ?? []).length > 0, false, false, color);
    if (isTTY) {
      lines.push(renderTextBox("Usage", usage, hw, color).join("\n"));
    } else {
      lines.push(renderPlainSection("Usage", usage).join("\n"));
    }

    const optRows = rowsForOptions(visibleOptions(schema.options), color);
    const optBox = isTTY ? renderTableBox("Options", optRows, hw, color) : renderPlainTable("Options", optRows, hw);
    if (optBox.length > 0) {
      lines.push("");
      lines.push(optBox.join("\n"));
    }
    if ((schema.commands ?? []).length > 0) {
      const subRows = rowsForSubcommands(schema.commands ?? []);
      const subBox = isTTY ? renderTableBox("Commands", subRows, hw, color) : renderPlainTable("Commands", subRows, hw);
      lines.push("");
      lines.push(subBox.join("\n"));
    }

    if (isCliLeaf(schema as unknown as CliNode) && showSchema) {
      const leaf = schema as unknown as CliLeaf;
      if (leaf.outputSchema !== undefined) {
        const title = isJsonLeaf(leaf) ? "Output Schema (JSON)" : "Output Schema (with --json)";
        const yamlLines = schemaToYamlLines(leaf.outputSchema, 0);
        if (yamlLines.length > 0) {
          lines.push("");
          if (isTTY) {
            lines.push(renderTextBox(title, yamlLines, hw, color).join("\n"));
          } else {
            lines.push(renderPlainSection(title, yamlLines).join("\n"));
          }
        }
      }
    }

    appendNotesBox(lines, schema.notes, schema.key, hw, color, isTTY);
    return `${lines.join("\n")}\n\n`;
  }

  let layer = schema.commands ?? [];
  let node: CliNode | undefined;
  for (const seg of helpPath) {
    const ch = layer.find((c: CliNode) => c.key === seg);
    if (!ch) {
      return `${color ? style.red("Unknown help path.") : "Unknown help path."}\n`;
    }
    node = ch;
    layer = isCliRouter(ch) ? ch.commands : [];
  }
  if (!node) {
    return `${color ? style.red("Unknown help path.") : "Unknown help path."}\n`;
  }

  const lines: string[] = [];
  lines.push("");
  if (node.description.length > 0) {
    lines.push(color ? style.white(node.description) : node.description);
    lines.push("");
  }
  const nodeIsJsonLeaf = isCliLeaf(node) && isJsonLeaf(node);
  const usage = usageLines(
    schema.key,
    helpPath,
    isCliRouter(node) && node.commands.length > 0,
    isCliLeaf(node) && (node.positionals ?? []).length > 0,
    nodeIsJsonLeaf,
    color,
  );
  if (isTTY) {
    lines.push(renderTextBox("Usage", usage, hw, color).join("\n"));
  } else {
    lines.push(renderPlainSection("Usage", usage).join("\n"));
  }

  if (nodeIsJsonLeaf && isCliLeaf(node)) {
    const inputRows = rowsForJsonInput(node.inputSchema);
    const inputBox = isTTY ? renderTableBox("Input", inputRows, hw, color) : renderPlainTable("Input", inputRows, hw);
    if (inputBox.length > 0) {
      lines.push("");
      lines.push(inputBox.join("\n"));
    }
    if (showSchema && node.inputSchema !== undefined) {
      const yamlLines = schemaToYamlLines(node.inputSchema, 0);
      if (yamlLines.length > 0) {
        lines.push("");
        if (isTTY) {
          lines.push(renderTextBox("Input Schema", yamlLines, hw, color).join("\n"));
        } else {
          lines.push(renderPlainSection("Input Schema", yamlLines).join("\n"));
        }
      }
    }
  } else {
    const optRows = rowsForOptions(visibleOptions(node.options), color);
    const optBox = isTTY ? renderTableBox("Options", optRows, hw, color) : renderPlainTable("Options", optRows, hw);
    if (optBox.length > 0) {
      lines.push("");
      lines.push(optBox.join("\n"));
    }

    const posRows = rowsForPositionals(isCliLeaf(node) ? (node.positionals ?? []) : [], color);
    const posBox = isTTY ? renderTableBox("Arguments", posRows, hw, color) : renderPlainTable("Arguments", posRows, hw);
    if (posBox.length > 0) {
      lines.push("");
      lines.push(posBox.join("\n"));
    }
  }

  const subcmds = isCliRouter(node) ? node.commands : [];
  const subRows = rowsForSubcommands(subcmds);
  const subBox = isTTY
    ? renderTableBox("Subcommands", subRows, hw, color)
    : renderPlainTable("Subcommands", subRows, hw);
  if (subBox.length > 0) {
    lines.push("");
    lines.push(subBox.join("\n"));
  }

  if (isCliLeaf(node) && node.outputSchema !== undefined && showSchema) {
    const title = nodeIsJsonLeaf ? "Output Schema (JSON)" : "Output Schema (with --json)";
    const yamlLines = schemaToYamlLines(node.outputSchema, 0);
    if (yamlLines.length > 0) {
      lines.push("");
      if (isTTY) {
        lines.push(renderTextBox(title, yamlLines, hw, color).join("\n"));
      } else {
        lines.push(renderPlainSection(title, yamlLines).join("\n"));
      }
    }
  }

  if ((node.notes ?? "").length > 0) {
    appendNotesBox(lines, node.notes, schema.key, hw, color, isTTY);
  }

  return `${lines.join("\n")}\n\n`;
}
