/*
This class packages parsed state for leaf handlers.
It carries the app name, routed command path, positional args, and resolved options
so handlers can focus on business logic instead of parser plumbing.

It keeps handlers small with a typed read API for flags, strings, numbers, and custom
parsed values.
*/

import type { AnyAppConfigSnapshot } from "./config/context.ts";
import { EmptyAppConfigSnapshot } from "./config/context.ts";
import { parseCommaList, parseDate, parseDateTime, parseDurationMs } from "./formats.ts";
import { collectOptionDefs } from "./parse.ts";
import type { CliInvocation, CliLeaf, CliNode, CliOption, CliProgram } from "./types.ts";
import { CliOptionKind, CliValueFormat, isCliLeaf, isCliRouter } from "./types.ts";
import { strictParseDouble } from "./utils.ts";

/** Coerced leaf inputs keyed by option and positional names. */
export type CliLeafInputs = Record<string, boolean | number | string | string[] | undefined>;

/**
 * Values passed to a leaf command handler after parsing: app name, routed path, args, and merged options.
 */
export class CliContext {
  readonly appName: string;
  readonly commandPath: string[];
  readonly args: string[];
  readonly program: CliProgram;
  readonly opts: Record<string, string>;
  readonly invocation: CliInvocation;
  readonly appConfig: AnyAppConfigSnapshot;

  /** Captures the program root, routed path, positional words, and option map for a leaf handler. */
  constructor(
    appName: string,
    commandPath: string[],
    args: string[],
    opts: Record<string, string>,
    program: CliProgram,
    invocation: CliInvocation = "cli",
    appConfig: AnyAppConfigSnapshot = new EmptyAppConfigSnapshot(program),
  ) {
    this.appName = appName;
    this.commandPath = commandPath;
    this.args = args;
    this.opts = opts;
    this.program = program;
    this.invocation = invocation;
    this.appConfig = appConfig;
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

  /** Duration option in milliseconds (post-parse validated). */
  durationOpt(name: string): number | undefined {
    const s = this.opts[name];
    if (s === undefined) return undefined;
    return parseDurationMs(s);
  }

  /** Comma-list option as a string array (post-parse validated). */
  commaListOpt(name: string): string[] | undefined {
    const s = this.opts[name];
    if (s === undefined) return undefined;
    return parseCommaList(s);
  }

  /** Date option as canonical YYYY-MM-DD (post-parse validated). */
  dateOpt(name: string): string | undefined {
    const s = this.opts[name];
    if (s === undefined) return undefined;
    return parseDate(s);
  }

  /** Date-time option as normalized ISO 8601 UTC (post-parse validated). */
  dateTimeOpt(name: string): string | undefined {
    const s = this.opts[name];
    if (s === undefined) return undefined;
    return parseDateTime(s);
  }

  /** Returns the value(s) for a named positional slot. Varargs slots return string[]; single slots return string | undefined. */
  positional(name: string): string | string[] | undefined {
    return this._positionalMap()[name];
  }

  /** Reads coerced option and positional values for the current leaf from schema metadata. */
  readLeafInputs(): CliLeafInputs {
    const leaf = this._leafNode();
    if (!leaf) return {};

    const out: CliLeafInputs = {};
    for (const opt of collectOptionDefs(this.program, this.commandPath)) {
      out[opt.name] = this._readOptionValue(opt);
    }
    for (const p of leaf.positionals ?? []) {
      const val = this.positional(p.name);
      if (val === undefined) {
        out[p.name] = undefined;
      } else if (Array.isArray(val)) {
        out[p.name] = val;
      } else {
        out[p.name] = val;
      }
    }
    return out;
  }

  private _readOptionValue(opt: CliOption): boolean | number | string | string[] | undefined {
    if (opt.kind === CliOptionKind.Presence) {
      return this.hasFlag(opt.name);
    }
    if (opt.kind === CliOptionKind.Number) {
      const n = this.numberOpt(opt.name);
      return n === null ? undefined : n;
    }
    if (opt.format === CliValueFormat.Duration) {
      return this.durationOpt(opt.name);
    }
    if (opt.format === CliValueFormat.CommaList) {
      return this.commaListOpt(opt.name);
    }
    if (opt.format === CliValueFormat.Date) {
      return this.dateOpt(opt.name);
    }
    if (opt.format === CliValueFormat.DateTime) {
      return this.dateTimeOpt(opt.name);
    }
    return this.stringOpt(opt.name);
  }

  private _leafNode(): CliLeaf | undefined {
    let node: CliNode = this.program;
    for (const seg of this.commandPath) {
      if (!isCliRouter(node)) return undefined;
      const child = node.commands.find((c) => c.key === seg);
      if (!child) return undefined;
      node = child;
    }
    return isCliLeaf(node) ? node : undefined;
  }

  private _posMap: Record<string, string | string[]> | undefined;

  private _positionalMap(): Record<string, string | string[]> {
    if (this._posMap) return this._posMap;

    const leaf = this._leafNode();
    if (!leaf) {
      this._posMap = {};
      return {};
    }

    const map: Record<string, string | string[]> = {};
    let argIdx = 0;
    for (const p of leaf.positionals ?? []) {
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
