/*
Filters hidden commands and options from presentation surfaces (help, schema, completions).
Parsing still uses the full tree via cliParseRoot.
*/

import type { CliNode, CliOption } from "./types.ts";
import { isCliRouter } from "./types.ts";

/** Options visible in help, schema, completions, and MCP tool schemas. */
export function visibleOptions(options: CliOption[] | undefined): CliOption[] {
  return (options ?? []).filter((o) => !o.hidden);
}

/** Strips hidden commands and options from one node for presentation export. */
export function presentationNode(node: CliNode): CliNode | null {
  if (node.hidden) {
    return null;
  }
  const options = visibleOptions(node.options);
  if (isCliRouter(node)) {
    const commands = node.commands
      .map((ch) => presentationNode(ch))
      .filter((ch): ch is CliNode => ch !== null);
    return { ...node, options, commands };
  }
  return { ...node, options };
}

/** Subcommands visible in help listings (parent may be any node in the parse tree). */
export function visibleSubcommands(cmds: CliNode[]): CliNode[] {
  return cmds.filter((c) => !c.hidden);
}
