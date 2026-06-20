/*
Shared completion scope walk used by bash, zsh, and fish emitters.
*/

import { type CliNode, type CliRouter, isCliLeaf, isCliRouter } from "../types.ts";

/** One tab-completion scope: child commands, options, and path key for the schema walk. */
export interface ScopeRec {
  kids: CliNode[];
  opts: import("../types.ts").CliOption[];
  path: string;
  wantsFiles: boolean;
}

function hasPositionalArguments(cmd: CliNode): boolean {
  return isCliLeaf(cmd) && (cmd.positionals ?? []).length > 0;
}

function walkScopes(cmdPath: string, cmd: CliNode, acc: ScopeRec[]): void {
  const kids = isCliRouter(cmd) ? cmd.commands : [];
  acc.push({
    kids,
    opts: cmd.options ?? [],
    path: cmdPath,
    wantsFiles: hasPositionalArguments(cmd),
  });
  for (const ch of kids) {
    const nextPath = cmdPath === "" ? ch.key : cmdPath + "/" + ch.key;
    walkScopes(nextPath, ch, acc);
  }
}

/** Flattens the schema into a list of completion scopes (root + every command path). */
export function collectScopes(schema: CliRouter): ScopeRec[] {
  const acc: ScopeRec[] = [];
  acc.push({
    kids: schema.commands ?? [],
    opts: schema.options ?? [],
    path: "",
    wantsFiles: false,
  });
  for (const c of schema.commands ?? []) {
    walkScopes(c.key, c, acc);
  }
  return acc;
}
