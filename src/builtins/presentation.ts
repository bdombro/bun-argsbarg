import type { CliCapabilities } from "../capabilities.ts";
import { resolveCapabilities } from "../capabilities.ts";
import { presentationNode, visibleOptions } from "../hidden.ts";
import type { CliLeaf, CliNode, CliProgram, CliRouter } from "../types.ts";
import { isCliLeaf } from "../types.ts";
import { resolveBuiltins } from "./registry.ts";

/** All built-in command nodes for argv parsing (includes hidden builtins). */
export function parseBuiltins(program: CliProgram, caps: CliCapabilities): CliNode[] {
  return resolveBuiltins(program, caps);
}

/** Built-in subtrees visible in help, schema, and completions (hidden builtins omitted). */
export function presentationBuiltins(program: CliProgram, caps: CliCapabilities): CliNode[] {
  return parseBuiltins(program, caps).filter((b) => !b.hidden);
}

/**
 * Full command tree for argv parsing, including hidden commands and builtins.
 * Routing programs merge user commands with builtins; leaf programs wrap builtins only.
 */
export function cliParseRoot(program: CliProgram): CliRouter {
  const caps = resolveCapabilities(program);
  const builtins = parseBuiltins(program, caps);

  if (isCliLeaf(program)) {
    return {
      key: program.key,
      description: program.description,
      notes: program.notes,
      options: program.options,
      commands: builtins,
    };
  }

  return {
    key: program.key,
    description: program.description,
    notes: program.notes,
    options: program.options,
    fallbackCommand: program.fallbackCommand,
    fallbackMode: program.fallbackMode,
    commands: [...program.commands, ...builtins],
  };
}

/**
 * Returns a schema suitable for help display, including capability-built-in subtrees.
 * Hidden commands and options are omitted. Routing programs get builtins merged;
 * leaf programs are wrapped as a tiny router.
 */
export function cliPresentationRoot(program: CliProgram): CliRouter {
  const caps = resolveCapabilities(program);
  const builtins = presentationBuiltins(program, caps);
  const notes = presentationRootNotes(program, caps);

  if (isCliLeaf(program)) {
    return {
      key: program.key,
      description: program.description,
      notes,
      options: visibleOptions(program.options),
      commands: builtins,
    };
  }

  const userCommands = program.commands
    .map((ch) => presentationNode(ch))
    .filter((ch): ch is CliNode => ch !== null);

  return {
    key: program.key,
    description: program.description,
    notes,
    options: visibleOptions(program.options),
    fallbackCommand: program.fallbackCommand,
    fallbackMode: program.fallbackMode,
    commands: [...userCommands, ...builtins],
  };
}

/** Root help notes: consumer `program.notes` plus agent discovery when `docs` is enabled. */
export function presentationRootNotes(
  program: CliProgram,
  caps: CliCapabilities,
): string | undefined {
  const parts: string[] = [];
  if ((program.notes ?? "").trim().length > 0) {
    parts.push((program.notes ?? "").trim());
  }
  if (caps.docs) {
    parts.push(`For AI agents: \`${program.key} docs skill\`.`);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n\n");
}

/** Presentation tree may include builtin leaf stubs. */
export type CliPresentationNode = CliNode | CliLeaf;
