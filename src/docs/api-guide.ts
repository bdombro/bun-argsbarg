import type { CliSchemaExport } from "../builtins/export.ts";
import { cliPositionalLabel, cliResolveNotes } from "../help.ts";
import { cliSchemaExport } from "../schema.ts";
import type { CliOption, CliPositional, CliProgram } from "../types.ts";
import { CliFallbackMode, CliOptionKind } from "../types.ts";

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

/** Markdown table cell for one option flag. */
function optionLabel(opt: CliOption): string {
  const long = `\`--${opt.name}\``;
  const short = opt.shortName ? ` (\`-${opt.shortName}\`)` : "";
  return `${long}${short}`;
}

/** One options table row. */
function formatOptionRow(opt: CliOption): string {
  const req = opt.required ? "required" : "optional";
  return `| ${optionLabel(opt)} | ${optionType(opt)} | ${req} | ${opt.description} |`;
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

/** Fallback routing note when present on a router node. */
function fallbackLine(node: CliSchemaExport): string | null {
  if (node.fallbackCommand === undefined) {
    return null;
  }
  const mode = node.fallbackMode ?? CliFallbackMode.MissingOnly;
  return `**Default subcommand:** \`${node.fallbackCommand}\` (\`${mode}\`)`;
}

/** Renders one command node and recurses into subcommands. */
function renderCommandNode(
  rootKey: string,
  path: string[],
  node: CliSchemaExport,
  lines: string[],
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

  if ((node.options ?? []).length > 0) {
    lines.push("#### Options", "");
    lines.push("| Option | Type | Required | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const opt of node.options!) {
      lines.push(formatOptionRow(opt));
    }
    lines.push("");
  }

  if ((node.positionals ?? []).length > 0) {
    lines.push("#### Positionals", "");
    lines.push("| Argument | Type | Required | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const p of node.positionals!) {
      lines.push(formatPositionalRow(p));
    }
    lines.push("");
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
    renderCommandNode(rootKey, [...path, child.key], child, lines);
  }
}

/** Generates markdown API reference from the same export as `docs schema`. */
export function generateApiGuide(program: CliProgram): string {
  const schema = cliSchemaExport(program);
  const lines: string[] = [
    `# ${program.key} — CLI API reference`,
    "",
    schema.description,
    "",
    `Machine-readable export: \`${program.key} docs schema\``,
    "",
  ];

  if (schema.notes) {
    lines.push(formatNotesBlockquote(schema.notes, program.key), "");
  }

  renderCommandNode(program.key, [], schema, lines);
  return `${lines.join("\n").trimEnd()}\n`;
}
