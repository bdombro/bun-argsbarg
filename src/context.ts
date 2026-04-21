/*
This class packages parsed state for leaf handlers.
It carries the app name, routed command path, positional args, and resolved options
so handlers can focus on business logic instead of parser plumbing.

It keeps handlers small with a typed read API for flags, strings, numbers, and custom
parsed values.
*/

import type { CliCommand } from "./types.ts";
import { strictParseDouble } from "./utils.ts";

/**
 * Values passed to a leaf command handler after parsing: app name, routed path, args, and merged options.
 */
export class CliContext {
  readonly appName: string;
  readonly commandPath: string[];
  readonly args: string[];
  readonly schema: CliCommand;
  readonly opts: Record<string, string>;

  constructor(
    appName: string,
    commandPath: string[],
    args: string[],
    opts: Record<string, string>,
    schema: CliCommand,
  ) {
    this.appName = appName;
    this.commandPath = commandPath;
    this.args = args;
    this.opts = opts;
    this.schema = schema;
  }

  /** Returns whether a presence flag was set (including implicit "1" for boolean options). */
  flag(name: string): boolean {
    return this.opts[name] !== undefined;
  }

  /** Returns the string value for a string-valued option, if present. */
  stringOpt(name: string): string | undefined {
    return this.opts[name];
  }

  /** Parses a stored string as a number; returns null if missing or not a strict double string. */
  numberOpt(name: string): number | null {
    const s = this.opts[name];
    if (s === undefined) return null;
    return strictParseDouble(s);
  }

  /**
   * Generic typed accessor: parses a stored string using the provided parse function.
   * This is the TypeScript-native advantage over the Swift version.
   */
  typedOpt<T>(name: string, parse: (s: string) => T): T | null {
    const s = this.opts[name];
    if (s === undefined) return null;
    try {
      return parse(s);
    } catch {
      return null;
    }
  }
}
