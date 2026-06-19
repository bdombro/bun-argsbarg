/*
This class packages parsed state for leaf handlers.
It carries the app name, routed command path, positional args, and resolved options
so handlers can focus on business logic instead of parser plumbing.

It keeps handlers small with a typed read API for flags, strings, numbers, and custom
parsed values.
*/

import type { CliCommand, CliInvocation } from "./types.ts";
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
  readonly invocation: CliInvocation;

  /** Captures the merged program root, routed path, positional words, and option map for a leaf handler. */
  constructor(
    appName: string,
    commandPath: string[],
    args: string[],
    opts: Record<string, string>,
    schema: CliCommand,
    invocation: CliInvocation = "cli",
  ) {
    this.appName = appName;
    this.commandPath = commandPath;
    this.args = args;
    this.opts = opts;
    this.schema = schema;
    this.invocation = invocation;
  }

  /** Returns whether a presence flag was set (including implicit "1" for boolean options). */
  hasFlag(name: string): boolean {
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

  /** Returns the value(s) for a named positional slot. Varargs slots return string[]; single slots return string | undefined. */
  positional(name: string): string | string[] | undefined {
    return this._positionalMap()[name];
  }

  private _posMap: Record<string, string | string[]> | undefined;

  private _positionalMap(): Record<string, string | string[]> {
    if (this._posMap) return this._posMap;

    let node: CliCommand = this.schema;
    for (const seg of this.commandPath) {
      const child = (node.commands ?? []).find((c) => c.key === seg);
      if (!child) {
        this._posMap = {};
        return {};
      }
      node = child;
    }

    const map: Record<string, string | string[]> = {};
    let argIdx = 0;
    for (const p of node.positionals ?? []) {
      const { argMax = 1 } = p;
      if (argMax === 0) {
        map[p.name] = this.args.slice(argIdx);
        argIdx = this.args.length;
      } else {
        const val = this.args[argIdx];
        if (val !== undefined) map[p.name] = val;
        argIdx++;
      }
    }

    this._posMap = map;
    return map;
  }
}
