/*
Per-surface exposure helpers (cli, http, mcpTool).
Parsing uses the full tree; presentation/schema/MCP/HTTP discovery use these filters.
*/

import type { CliLeaf, CliNode, CliNodeBase, CliOption } from "../core/types.ts";
import { isCliRouter } from "../core/types.ts";

/** True when the node is omitted from CLI help, schema, and completions (still invocable). */
export function isCliHidden(node: CliNodeBase): boolean {
  return node.cli?.hidden === true;
}

/** True when the option is omitted from CLI help, schema, and completions. */
export function isOptionCliHidden(opt: CliOption): boolean {
  return opt.cli?.hidden === true;
}

/** True when the node is omitted from cli-schema export. */
export function isCliSchemaHidden(node: CliNodeBase): boolean {
  if (node.cli?.schema?.enabled === false) {
    return true;
  }
  if (node.cli?.schema?.hidden === true) {
    return true;
  }
  return isCliHidden(node);
}

/** True when the node is omitted from shell completions. */
export function isCliCompletionsHidden(node: CliNodeBase): boolean {
  if (node.cli?.completions?.enabled === false) {
    return true;
  }
  if (node.cli?.completions?.hidden === true) {
    return true;
  }
  return isCliHidden(node);
}

/** True when the leaf is omitted from MCP tools/list. */
export function isMcpHidden(leaf: CliLeaf): boolean {
  if (leaf.mcpTool?.enabled === false) {
    return true;
  }
  return leaf.mcpTool?.hidden === true;
}

/** True when the node is not callable via CLI (`cli.enabled: false`, cascades from parent). */
export function isCliCallable(node: CliNodeBase, parentEnabled = true): boolean {
  if (!parentEnabled) {
    return false;
  }
  if (node.cli?.enabled === false) {
    return false;
  }
  return true;
}

/** True when the leaf is omitted from HTTP route table / OpenAPI. */
export function isHttpHidden(node: CliNodeBase): boolean {
  return node.http?.hidden === true;
}

/** True when the leaf is not exposed on HTTP (disabled or hidden). */
export function isHttpDisabled(node: CliNodeBase): boolean {
  return node.http?.enabled === false;
}

/** Options visible in help, schema, completions, and MCP tool inputSchema. */
export function visibleOptions(options: CliOption[] | undefined): CliOption[] {
  return (options ?? []).filter((o) => !isOptionCliHidden(o));
}

/** Strips CLI-hidden commands and options from one node for presentation export. */
export function presentationNode(node: CliNode): CliNode | null {
  if (isCliHidden(node)) {
    return null;
  }
  const options = visibleOptions(node.options);
  if (isCliRouter(node)) {
    const commands = node.commands.map((ch) => presentationNode(ch)).filter((ch): ch is CliNode => ch !== null);
    return { ...node, options, commands };
  }
  return { ...node, options };
}

/** Subcommands visible in help listings. */
export function visibleSubcommands(cmds: CliNode[]): CliNode[] {
  return cmds.filter((c) => !isCliHidden(c));
}

/** Default HTTP response metadata from a leaf `http` block. */
export function leafHttpResponseDefaults(leaf: CliLeaf): {
  contentType?: string;
  contentDisposition?: string;
} {
  return {
    contentType: leaf.http?.successContentType,
    contentDisposition: leaf.http?.contentDisposition,
  };
}
