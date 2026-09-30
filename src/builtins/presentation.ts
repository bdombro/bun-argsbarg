import type { AppSpec, Command, CommandGroup } from "../core/types.ts";
import { hasHandler } from "../core/types.ts";
import type { Capabilities } from "../runtime/capabilities.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";
import { isCliHidden, presentationNode, visibleOptions } from "../runtime/exposure.ts";
import { resolveBuiltins } from "./registry.ts";

/** All built-in command nodes for argv parsing (includes hidden builtins). */
export function parseBuiltins(program: AppSpec, caps: Capabilities): Command[] {
  return resolveBuiltins(program, caps);
}

/** Built-in subtrees visible in help, schema, and completions (hidden builtins omitted). */
export function presentationBuiltins(program: AppSpec, caps: Capabilities): Command[] {
  return parseBuiltins(program, caps).filter((b) => !isCliHidden(b));
}

/**
 * Full command tree for argv parsing, including hidden commands and builtins.
 * Routing programs merge user commands with builtins; leaf programs wrap builtins only.
 */
export function cliParseRoot(program: AppSpec): CommandGroup {
  const caps = resolveCapabilities(program);
  const builtins = parseBuiltins(program, caps);

  if (hasHandler(program)) {
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
export function cliPresentationRoot(program: AppSpec): CommandGroup {
  const caps = resolveCapabilities(program);
  const builtins = presentationBuiltins(program, caps);
  const notes = presentationRootNotes(program, caps);

  if (hasHandler(program)) {
    return {
      key: program.key,
      description: program.description,
      notes,
      options: visibleOptions(program.options),
      commands: builtins,
    };
  }

  const userCommands = program.commands.map((ch) => presentationNode(ch)).filter((ch): ch is Command => ch !== null);

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

/** Root help notes from the app's `notes`. */
export function presentationRootNotes(program: AppSpec, _caps: Capabilities): string | undefined {
  const parts: string[] = [];
  if ((program.notes ?? "").trim().length > 0) {
    parts.push((program.notes ?? "").trim());
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n\n");
}
