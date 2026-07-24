import type { CliSchemaExport } from "~/builtins/export.ts";
import { cliSchemaExport } from "~/core/schema.ts";
import type { CliOption, CliPositional, CliProgram } from "~/core/types.ts";
import { CliFallbackMode, CliOptionKind } from "~/core/types.ts";
import { cliPositionalLabel, cliResolveNotes } from "~/help.ts";

/** Options for {@link generateCliGuideBody} and {@link generateCliGuide}. */
export interface CliGuideBodyOptions {
  /** Omit embedded outputSchema JSON; point to `docs cli-schema` instead (skill reference). */
  compact?: boolean;
}

/** CLI invocation path as a single string (`myapp stat owner lookup`). */
function commandPath(rootKey: string, path: string[]): string {
  if (path.length === 0) {
    return rootKey;
  }
  return [rootKey, ...path].join(" ");
}

/** Human-readable option type for API tables. */
function optionType(opt: CliOption): string {
  if (opt.kind === CliOptionKind.Presence) {
    return "flag";
  }
  if (opt.kind === CliOptionKind.Enum) {
    return `enum (\`${(opt.choices ?? []).join("`, `")}\`)`;
  }
  return opt.kind;
}

function optionFormatDefault(opt: CliOption): string {
  const parts: string[] = [];
  if (opt.format !== undefined) {
    parts.push(opt.format);
  }
  if (opt.default !== undefined) {
    parts.push(`default \`${opt.default}\``);
  }
  if (opt.pattern !== undefined) {
    parts.push(`pattern \`${opt.pattern}\``);
  }
  return parts.length > 0 ? parts.join("; ") : "—";
}

/** Markdown table cell for one option flag. */
function optionLabel(opt: CliOption): string {
  const long = `\`--${opt.name}\``;
  const short = opt.shortName ? ` (\`-${opt.shortName}\`)` : "";
  return `${long}${short}`;
}

/** One options table row. */
function formatOptionRow(opt: CliOption): string {
  const req = opt.required ? "required" : "optional";
  return `| ${optionLabel(opt)} | ${optionType(opt)} | ${req} | ${optionFormatDefault(opt)} | ${opt.description} |`;
}

/** One positionals table row. */
function formatPositionalRow(p: CliPositional): string {
  const label = cliPositionalLabel(p, false);
  const req = (p.argMin ?? 1) > 0 ? "required" : "optional";
  return `| \`${label}\` | ${p.kind} | ${req} | ${p.description} |`;
}

/** Markdown blockquote for command notes (`{argsbarg:program}` resolved to root key). */
function formatNotesBlockquote(notes: string, appKey: string): string {
  const resolved = cliResolveNotes(notes, appKey);
  return resolved
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/** Markdown section for leaf outputSchema (docs cli / skill reference). */
function formatOutputSchemaSection(schema: Record<string, unknown>): string[] {
  return [
    "#### Output",
    "",
    "JSON Schema for output when/if handler emits JSON",
    "",
    "```json",
    JSON.stringify(schema, null, 2),
    "```",
    "",
  ];
}

/** Fallback routing note when present on a router node. */
function fallbackLine(node: CliSchemaExport): string | null {
  if (node.fallbackCommand === undefined) {
    return null;
  }
  const mode = node.fallbackMode ?? CliFallbackMode.MissingOnly;
  return `**Default subcommand:** \`${node.fallbackCommand}\` (\`${mode}\`)`;
}

/** Compact outputSchema pointer instead of inlined JSON. */
function formatOutputSchemaPointer(rootKey: string): string[] {
  return ["#### Output", "", `See \`${rootKey} docs cli-schema\` for outputSchema when set.`, ""];
}

/** Renders one command node and recurses into subcommands. */
function renderCommandNode(
  rootKey: string,
  path: string[],
  node: CliSchemaExport,
  lines: string[],
  opts: CliGuideBodyOptions,
): void {
  const level = Math.min(path.length + 2, 6);
  const heading = "#".repeat(level);
  const cmd = commandPath(rootKey, path);

  lines.push(`${heading} \`${cmd}\``, "", node.description, "");

  if (node.notes) {
    lines.push(formatNotesBlockquote(node.notes, rootKey), "");
  }

  const fb = fallbackLine(node);
  if (fb) {
    lines.push(fb, "");
  }

  const isJsonStyleLeaf =
    opts.compact &&
    (node.options ?? []).length === 0 &&
    (node.positionals ?? []).length === 0 &&
    !node.commands?.length;

  if (isJsonStyleLeaf) {
    lines.push(`Input shape: see \`${rootKey} docs cli-schema\`.`, "");
  } else if ((node.options ?? []).length > 0) {
    lines.push("#### Options", "");
    lines.push("| Option | Type | Required | Format / default | Description |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const opt of node.options ?? []) {
      lines.push(formatOptionRow(opt));
    }
    lines.push("");
  }

  if ((node.positionals ?? []).length > 0) {
    lines.push("#### Positionals", "");
    lines.push("| Argument | Type | Required | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const p of node.positionals ?? []) {
      lines.push(formatPositionalRow(p));
    }
    lines.push("");
  }

  if (node.outputSchema !== undefined) {
    if (opts.compact) {
      lines.push(...formatOutputSchemaPointer(rootKey));
    } else {
      lines.push(...formatOutputSchemaSection(node.outputSchema));
    }
  }

  const children = node.commands ?? [];
  if (children.length > 0) {
    lines.push("#### Subcommands", "");
    for (const child of children) {
      lines.push(`- \`${child.key}\` — ${child.description}`);
    }
    lines.push("");
  }

  for (const child of children) {
    renderCommandNode(rootKey, [...path, child.key], child, lines, opts);
  }
}

/** Command-tree markdown shared by `docs cli` and generated agent skills (no API doc header). */
export function generateCliGuideBody(program: CliProgram, opts: CliGuideBodyOptions = {}): string {
  const schema = cliSchemaExport(program);
  const lines: string[] = [];
  renderCommandNode(program.key, [], schema, lines, opts);
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Generates markdown CLI reference from the same export as `docs cli-schema`. */
export function generateCliGuide(program: CliProgram, opts: CliGuideBodyOptions = {}): string {
  const schema = cliSchemaExport(program);
  const lines: string[] = [
    `# ${program.key} — CLI API reference`,
    "",
    schema.description,
    "",
    `Machine-readable export: \`${program.key} docs cli-schema\``,
    "",
  ];

  if (schema.notes) {
    lines.push(formatNotesBlockquote(schema.notes, program.key), "");
  }

  lines.push(generateCliGuideBody(program, opts).trimEnd(), "");
  return `${lines.join("\n").trimEnd()}\n`;
}
