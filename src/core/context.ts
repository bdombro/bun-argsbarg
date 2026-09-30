/*
This class packages parsed state for command handlers.
It carries the app name, routed command path, positional args, and resolved options
so handlers can focus on business logic instead of parser plumbing.

It keeps handlers small with a typed read API for flags, strings, numbers, and custom
parsed values.
*/

import { parseCommaList, parseDate, parseDateTime, parseDurationMs } from "./formats.ts";
import { InputError, loadLeafInputs, readJsonOptionValue } from "./leaf-inputs.ts";
import { normalizeRespondOptions, writeRespondBodyToStdout } from "./respond.ts";
import type { AppSpec, Command, Invocation, Locals, RespondOptions, RunnableCommand, ServerRuntime } from "./types.ts";
import { hasHandler, hasSubcommands } from "./types.ts";
import { strictParseDouble } from "./utils.ts";
import { validateWithSchema } from "./zod-schema.ts";

/** Coerced command inputs keyed by option and positional names. */
export type CommandInputs = Record<string, boolean | number | string | string[] | unknown | undefined>;

/**
 * Values passed to a command handler after parsing: app name, routed path, args, and merged options.
 * `I` is the type of {@link CommandContext.inputs} and `PP` of {@link CommandContext.pathParams} (both inferred via `command`).
 */
export class CommandContext<I = CommandInputs, PP = Record<string, string>> {
  readonly appName: string;
  readonly commandPath: string[];
  args: string[];
  readonly spec: AppSpec;
  opts: Record<string, string>;
  readonly invocation: Invocation;
  /** Original flat tool arguments for API/MCP invocations (when provided). */
  readonly toolArgs?: Record<string, unknown>;
  /** Raw `:param` segment values from command group descent (before any `pathParams` schema validation). */
  readonly rawPathParams: Record<string, string>;
  /** Pipable Json option values read from stdin before the handler (CLI only). */
  readonly preloadedJson: Record<string, unknown>;
  /** Per-invocation bag; `beforeInvoke` may write. */
  readonly locals: Locals;
  /** Shared server state for HTTP/MCP invocations. */
  runtime?: ServerRuntime;

  private response?: RespondOptions;
  /** Cached result of {@link pathParams} (validated once per invocation). */
  private pathParamsCache?: { value: PP };
  /** Cached result of {@link inputs} (loaded and validated once per invocation). */
  private leafInputsCache?: { value: I };

  /** Captures the app spec, routed path, positional words, and option map for a command handler. */
  constructor(
    appName: string,
    commandPath: string[],
    args: string[],
    opts: Record<string, string>,
    program: AppSpec,
    invocation: Invocation = "cli",
    toolArgs?: Record<string, unknown>,
    preloadedJson: Record<string, unknown> = {},
    pathParams: Record<string, string> = {},
    locals: Locals = {} as Locals,
    runtime?: ServerRuntime,
  ) {
    this.appName = appName;
    this.commandPath = commandPath;
    this.args = args;
    this.opts = opts;
    this.spec = program;
    this.invocation = invocation;
    this.toolArgs = toolArgs;
    this.preloadedJson = preloadedJson;
    this.rawPathParams = pathParams;
    this.locals = locals;
    this.runtime = runtime;
  }

  /**
   * Sets the machine-readable response for API/MCP invocations, or writes to stdout in CLI mode.
   * May only be called once per invocation.
   */
  respond(opts: RespondOptions): void {
    if (this.response !== undefined) {
      throw new Error("ctx.respond() was already called for this invocation");
    }
    const normalized = normalizeRespondOptions(opts);
    if (this.invocation === "cli") {
      writeRespondBodyToStdout(normalized.body);
      return;
    }
    this.response = normalized;
  }

  /** Returns the respond payload set by {@link respond}, if any. */
  getResponse(): RespondOptions | undefined {
    return this.response;
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

  /**
   * Parsed Json option: `--name '<json>'`, preloaded piped stdin (when `pipable`), or MCP/API toolArgs.
   * Flag wins over stdin and toolArgs.
   */
  jsonOpt(name: string): unknown | undefined {
    return readJsonOptionValue(this as unknown as CommandContext, name);
  }

  /** Returns the value(s) for a named positional slot. Varargs slots return string[]; single slots return string | undefined. */
  positional(name: string): string | string[] | undefined {
    return this._positionalMap()[name];
  }

  /**
   * `:param` values for the current command. With the command's `pathParams`, this is the schema's parsed output, validated
   * before the handler runs (a mismatch is a {@link InputError}); otherwise the raw string segments.
   */
  get pathParams(): PP {
    if (this.pathParamsCache !== undefined) {
      return this.pathParamsCache.value;
    }
    const schema = this._leafNode()?.pathParams;
    if (schema === undefined) {
      this.pathParamsCache = { value: this.rawPathParams as PP };
      return this.pathParamsCache.value;
    }
    const result = validateWithSchema(schema, this.rawPathParams);
    if (!result.valid) {
      throw new InputError(result.errors.join("; "));
    }
    this.pathParamsCache = { value: result.value as PP };
    return this.pathParamsCache.value;
  }

  /**
   * Inputs for the current command. With the command's `inputSchema`, this is the schema's parsed output (defaults and
   * transforms applied), validated before the handler runs; otherwise the coerced option and positional values.
   */
  get inputs(): I {
    if (this.leafInputsCache !== undefined) {
      return this.leafInputsCache.value;
    }
    this.leafInputsCache = { value: loadLeafInputs(this as unknown as CommandContext) as I };
    return this.leafInputsCache.value;
  }

  private _leafNode(): RunnableCommand | undefined {
    let node: Command = this.spec;
    for (const seg of this.commandPath) {
      if (!hasSubcommands(node)) return undefined;
      const child = node.commands.find((c) => c.key === seg);
      if (!child) return undefined;
      node = child;
    }
    return hasHandler(node) ? node : undefined;
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
