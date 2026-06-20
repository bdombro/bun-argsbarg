/*
Shared completion scope walk used by bash, zsh, and fish emitters.
*/

import { CliCommand } from "../types.ts";

/** One tab-completion scope: child commands, options, and path key for the schema walk. */
export interface ScopeRec {
  kids: CliCommand[];
  opts: import("../types.ts").CliOption[];
  path: string;
  wantsFiles: boolean;
}

function hasPositionalArguments(cmd: CliCommand): boolean {
  return (cmd.positionals ?? []).length > 0;
}

function walkScopes(cmdPath: string, cmd: CliCommand, acc: ScopeRec[]): void {
  acc.push({
    kids: cmd.commands ?? [],
    opts: cmd.options ?? [],
    path: cmdPath,
    wantsFiles: hasPositionalArguments(cmd),
  });
  for (const ch of cmd.commands ?? []) {
    const nextPath = cmdPath === "" ? ch.key : cmdPath + "/" + ch.key;
    walkScopes(nextPath, ch, acc);
  }
}

/** Flattens the schema into a list of completion scopes (root + every command path). */
export function collectScopes(schema: CliCommand): ScopeRec[] {
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
