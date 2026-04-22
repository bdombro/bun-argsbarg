/*
This module renders CLI help with wrapping, boxes, tables, and TTY color.
It formats both explicit help and error output, using the terminal width to keep the
layout readable and aligned with the current display.

It keeps help formatting shared across help and error paths so users see one consistent
style no matter how help is reached.
*/

import { CliCommand, CliOption, CliOptionKind, CliPositional } from "./types.ts";

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
const kBoxV = "\u2502";  // │
const kBoxBL = "\u2570"; // ╰
const kBoxBR = "\u256F"; // ╯
const kBoxH = "\u2500";  // ─

// ── Terminal Detection ────────────────────────────────────────────────────────

/** Returns a minimum column width for help, clamped to stdout width when known. */
function getHelpWidth(): number {
  return Math.max(40, process.stdout.columns || 80);
}

/** True when stdout is a TTY (used to decide on color). */
function isTTY(): boolean {
  return process.stdout.isTTY !== undefined;
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
      cur += " " + word;
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
function optKindLabel(k: CliOptionKind): string {
  switch (k) {
    case CliOptionKind.Presence:
      return "";
    case CliOptionKind.Number:
      return " <number>";
    case CliOptionKind.String:
      return " <string>";
  }
}

/** Formats a flag/value option for help tables: `--name`, optional short, optional kind hint. */
export function cliOptionLabel(o: CliOption, color: boolean): string {
  let r = "--" + o.name + optKindLabel(o.kind);
  if (o.shortName) r += ", -" + o.shortName;
  if (!color) return r;

  const sepIdx = r.indexOf(", ");
  if (sepIdx === -1) return style.aquaBold(r);
  const left = r.slice(0, sepIdx);
  const right = r.slice(sepIdx + 2);
  return style.aquaBold(left) + " " + style.greenBright(right);
}

/** Formats a positional slot label (`<n>`, `[n]`, or varargs) for help. */
export function cliPositionalLabel(p: CliPositional, color: boolean): string {
  let r: string;
  if (p.argMax === 1) {
    r = p.argMin === 0 ? "[" + p.name + "]" : "<" + p.name + ">";
  } else {
    r = p.argMin === 0 ? "[" + p.name + "...]" : "<" + p.name + "...>";
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
    ? style.gray(kBoxH + " ") + style.grayBoldTitle(title) + style.gray(" ")
    : kBoxH + " " + title + " ";

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
    out.push(
      (color ? style.gray(kBoxV) : kBoxV) + " " + padded + " " + (color ? style.gray(kBoxV) : kBoxV),
    );
  }

  out.push(
    (color ? style.gray(kBoxBL + repeatBoxH(borderWidth) + kBoxBR) : kBoxBL + repeatBoxH(borderWidth) + kBoxBR),
  );

  return out;
}

/** Renders a two-column label/description table in a box (options, subcommands, positionals). */
function renderTableBox(title: string, rows: HelpRow[], hw: number, color: boolean): string[] {
  if (rows.length === 0) return [];

  let labelWidth = 0;
  for (const row of rows) {
    labelWidth = Math.max(labelWidth, visibleWidth(row.label));
  }

  const titleChunk = kBoxH + " " + title + " ";
  const minimumContentWidth = Math.max(visibleWidth(titleChunk) + 1, labelWidth + 2 + 18);
  let contentWidth = Math.max(hw - 2, minimumContentWidth);
  const descWidth = Math.max(1, contentWidth - labelWidth - 2);

  const bodyLines: string[] = [];
  for (const row of rows) {
    const wrapped = wrapText(row.description, descWidth);
    const first =
      row.label + spaces(labelWidth - visibleWidth(row.label)) + "  " +
      (color ? style.white(wrapped[0]) : wrapped[0]);
    bodyLines.push(first);
    for (let idx = 1; idx < wrapped.length; idx++) {
      const pad = color ? style.gray(spaces(labelWidth)) : spaces(labelWidth);
      bodyLines.push(pad + "  " + (color ? style.white(wrapped[idx]) : wrapped[idx]));
    }
  }

  let titleLead: string;
  if (color) {
    titleLead = style.gray(kBoxH + " ") + style.grayBoldTitle(title) + style.gray(" ");
  } else {
    titleLead = kBoxH + " " + title + " ";
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
    out.push(
      (color ? style.gray(kBoxV) : kBoxV) + " " + padded + " " + (color ? style.gray(kBoxV) : kBoxV),
    );
  }

  out.push(
    (color ? style.gray(kBoxBL + repeatBoxH(borderWidth) + kBoxBR) : kBoxBL + repeatBoxH(borderWidth) + kBoxBR),
  );

  return out;
}

// ── Usage & Rows ──────────────────────────────────────────────────────────────

/** Builds one or two usage line strings (OPTIONS / COMMAND / ARGS) for the help header. */
function usageLines(
  appName: string,
  helpPath: string[],
  hasCommands: boolean,
  hasArgs: boolean,
  color: boolean,
): string[] {
  let fullPath = appName;
  for (const seg of helpPath) {
    fullPath += " " + seg;
  }
  const usageOpts = color ? style.aquaBold("[OPTIONS]") : "[OPTIONS]";
  const usageCmd = color ? style.aquaBold("COMMAND") : "COMMAND";
  const usageArgs = color ? style.aquaBold("[ARGS]...") : "[ARGS]...";

  const out: string[] = [];
  if (helpPath.length === 0) {
    if (hasCommands) {
      out.push(fullPath + " " + usageOpts + " " + usageCmd + " " + usageArgs);
    } else {
      out.push(fullPath + " " + usageOpts);
    }
    return out;
  }
  out.push(fullPath + " " + usageOpts + (hasArgs ? (" " + usageArgs) : ""));
  if (hasCommands) {
    out.push(fullPath + " " + usageCmd + " " + usageArgs);
  }
  return out;
}

/** Table rows for named options, including a synthetic `--help, -h` row. */
function rowsForOptions(defs: CliOption[], color: boolean): HelpRow[] {
  const rows: HelpRow[] = [];
  const helpLabel = color
    ? style.aquaBold("--help, ") + style.greenBright("-h")
    : "--help, -h";
  rows.push({ label: helpLabel, description: "Show help for this command." });
  for (const o of defs) {
    rows.push({ label: cliOptionLabel(o, color), description: o.description });
  }
  return rows;
}

/** Table rows for positional `CliPositional` definitions. */
function rowsForPositionals(defs: CliPositional[], color: boolean): HelpRow[] {
  return defs.map((p) => ({ label: cliPositionalLabel(p, color), description: p.description }));
}

/** Table rows for subcommands, sorted by key. */
function rowsForSubcommands(cmds: CliCommand[]): HelpRow[] {
  return cmds
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((c) => ({ label: c.key, description: c.description }));
}

// ── Main Help Render ──────────────────────────────────────────────────────────

/**
 * Renders full help for the app root or a nested command, following `helpPath` from the root key.
 * `useStderr` is reserved for call-site consistency; width and color use stdout TTY.
 */
export function cliHelpRender(schema: CliCommand, helpPath: string[], useStderr: boolean): string {
  const hw = getHelpWidth();
  const color = isTTY();

  if (helpPath.length === 0) {
    const lines: string[] = [];
    lines.push("");
    if (schema.description.length > 0) {
      lines.push(color ? style.white(schema.description) : schema.description);
      lines.push("");
    }
    lines.push(
      renderTextBox(
        "Usage",
        usageLines(schema.key, helpPath, (schema.commands ?? []).length > 0, false, color),
        hw,
        color,
      ).join("\n"),
    );

    const optBox = renderTableBox("Options", rowsForOptions(schema.options ?? [], color), hw, color);
    if (optBox.length > 0) {
      lines.push("");
      lines.push(optBox.join("\n"));
    }
    if ((schema.commands ?? []).length > 0) {
      lines.push("");
      lines.push(
        renderTableBox("Commands", rowsForSubcommands(schema.commands ?? []), hw, color).join("\n"),
      );
    }
    return lines.join("\n") + "\n\n";
  }

  let layer = schema.commands ?? [];
  let node: CliCommand | undefined;
  for (const seg of helpPath) {
    const ch = layer.find((c) => c.key === seg);
    if (!ch) {
      return (color ? style.red("Unknown help path.") : "Unknown help path.") + "\n";
    }
    node = ch;
    layer = ch.commands ?? [];
  }
  if (!node) {
    return (color ? style.red("Unknown help path.") : "Unknown help path.") + "\n";
  }

  const lines: string[] = [];
  lines.push("");
  if (node.description.length > 0) {
    lines.push(color ? style.white(node.description) : node.description);
    lines.push("");
  }
  lines.push(
    renderTextBox(
      "Usage",
      usageLines(schema.key, helpPath, (node.commands ?? []).length > 0, (node.positionals ?? []).length > 0, color),
      hw,
      color,
    ).join("\n"),
  );

  const optBox = renderTableBox("Options", rowsForOptions(node.options ?? [], color), hw, color);
  if (optBox.length > 0) {
    lines.push("");
    lines.push(optBox.join("\n"));
  }

  const posBox = renderTableBox("Arguments", rowsForPositionals(node.positionals ?? [], color), hw, color);
  if (posBox.length > 0) {
    lines.push("");
    lines.push(posBox.join("\n"));
  }

  const subBox = renderTableBox("Subcommands", rowsForSubcommands(node.commands ?? []), hw, color);
  if (subBox.length > 0) {
    lines.push("");
    lines.push(subBox.join("\n"));
  }

  if ((node.notes ?? "").length > 0) {
    let resolved = node.notes!;
    while (true) {
      const r = resolved.indexOf("{app}");
      if (r === -1) break;
      resolved = resolved.slice(0, r) + schema.key + resolved.slice(r + 5);
    }
    lines.push("");
    lines.push(
      renderTextBox("Notes", wrapText(resolved, hw - 4), hw, color).join("\n"),
    );
  }

  return lines.join("\n") + "\n\n";
}
