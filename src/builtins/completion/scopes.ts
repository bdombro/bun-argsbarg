/*
Shared completion scope walk used by bash, zsh, and fish emitters.
*/

import { type Command, type CommandGroup, hasHandler, hasSubcommands } from "../../core/types.ts";
import { isCliCompletionsHidden } from "../../runtime/exposure.ts";

/** One tab-completion scope: child commands, options, and path key for the schema walk. */
export interface ScopeRec {
  kids: Command[];
  opts: readonly import("../../core/types.ts").CommandOption[];
  path: string;
  wantsFiles: boolean;
}

function hasPositionalArguments(cmd: Command): boolean {
  return hasHandler(cmd) && (cmd.positionals ?? []).length > 0;
}

function walkScopes(cmdPath: string, cmd: Command, acc: ScopeRec[]): void {
  const kids = hasSubcommands(cmd) ? cmd.commands.filter((ch) => !isCliCompletionsHidden(ch)) : [];
  acc.push({
    kids,
    opts: cmd.options ?? [],
    path: cmdPath,
    wantsFiles: hasPositionalArguments(cmd),
  });
  for (const ch of kids) {
    const nextPath = cmdPath === "" ? ch.key : `${cmdPath}/${ch.key}`;
    walkScopes(nextPath, ch, acc);
  }
}

/** Flattens the schema into a list of completion scopes (root + every command path). */
export function collectScopes(schema: CommandGroup): ScopeRec[] {
  const acc: ScopeRec[] = [];
  const rootKids = (schema.commands ?? []).filter((c) => !isCliCompletionsHidden(c));
  acc.push({
    kids: rootKids,
    opts: schema.options ?? [],
    path: "",
    wantsFiles: false,
  });
  for (const c of rootKids) {
    walkScopes(c.key, c, acc);
  }
  return acc;
}
