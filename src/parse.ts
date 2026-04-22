/*
This module parses argv into commands, options, and positional tails.
It resolves fallback routing, tracks help requests, and shapes the parse result that
later validation and runtime dispatch both consume.

It keeps handler dispatch and help on one parser so the CLI behavior stays consistent
across every entry path.
*/

import { CliContext } from "./context.ts";
import {
  CliCommand,
  CliFallbackMode,
  CliOption,
  CliOptionKind,
} from "./types.ts";
import { fullStringIsDouble } from "./utils.ts";

// ── Parse Result ──────────────────────────────────────────────────────────────

/**
 * Outcome of a parse: success, help request, or fatal user error.
 */
export enum ParseKind {
  /** Parsed successfully; options and positionals are valid. */
  Ok = "ok",
  /** User requested help (explicit or implicit). */
  Help = "help",
  /** User error (unknown command, bad option, etc.). */
  Error = "error",
}

/** Structured parse output: routed path, merged options, positional args, and help/error metadata. */
export interface ParseResult {
  /** Parse outcome (ok, help, or error). */
  kind: ParseKind;
  /** Routed subcommand keys from the program root (e.g. `["hello"]`). */
  path: string[];
  /** Merged long/short option values as string values (presence → `"1"`). */
  opts: Record<string, string>;
  /** Positional arguments for the leaf command, in order. */
  args: string[];
  /** True when the user passed `-h` / `--help` explicitly. */
  helpExplicit: boolean;
  /** Path segments for scoped help (empty for root help). */
  helpPath: string[];
  /** User-facing error message when `kind === Error`. */
  errorMsg: string;
  /** Help path to render next to an error (for contextual help). */
  errorHelpPath: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const helpShort = "-h";
const helpLong = "--help";

/** Returns true if the argv token is `-h` or `--help`. */
function isHelpTok(tok: string): boolean {
  return tok === helpShort || tok === helpLong;
}

/** Looks up a subcommand or routing node by `key`. */
function findChild(cmds: CliCommand[], name: string): CliCommand | undefined {
  return cmds.find((c) => c.key === name);
}

/** Resolves a long-option definition by name (without leading `--`). */
function findOptionByName(defs: CliOption[], name: string): CliOption | undefined {
  return defs.find((o) => o.name === name);
}

/** Resolves a short-option definition by its single character. */
function findOptionDefByShort(defs: CliOption[], short: string): CliOption | undefined {
  return defs.find((o) => o.shortName === short);
}

// ── Option Consumption ────────────────────────────────────────────────────────

/** State from scanning argv for flags: error text, lenient early exit, or `--` seen. */
interface ConsumeReport {
  /** User-facing error when option parsing failed; null on success. */
  err: string | null;
  /** True when lenient mode stopped on an unknown option token. */
  stoppedOnUnknown: boolean;
  /** True when `--` was read (remaining argv is positional-only). */
  sawDoubleDash: boolean;
}

/** Consumes argv from index `i` for long/short options, updating `opts` until a non-option or `--`. */
function consumeOptions(
  defs: CliOption[],
  lenientUnknown: boolean,
  argv: string[],
  i: number,
  opts: Record<string, string>,
): { report: ConsumeReport; nextIndex: number } {
  let idx = i;

  /** Parses a single `--name` or `--name=value` token. Returns an error string, `""` if unknown and lenient, or `null` on success. */
  function consumeLong(tok: string): string | null {
    const body = tok.slice(2);
    let optName: string;
    let inlineVal: string | undefined;

    const eqIdx = body.indexOf("=");
    if (eqIdx !== -1) {
      optName = body.slice(0, eqIdx);
      inlineVal = body.slice(eqIdx + 1);
    } else {
      optName = body;
      inlineVal = undefined;
    }

    const def = findOptionByName(defs, optName);
    if (!def) {
      if (lenientUnknown) return "";
      return `Unknown option: --${optName}`;
    }

    if (inlineVal !== undefined) {
      if (def.kind === CliOptionKind.Presence) {
        opts[def.name] = "1";
      } else {
        opts[def.name] = inlineVal;
      }
      idx += 1;
      return null;
    }

    if (def.kind === CliOptionKind.Presence) {
      opts[def.name] = "1";
    } else {
      idx += 1;
      if (idx >= argv.length) {
        return `Missing value for option: --${optName}`;
      }
      opts[def.name] = argv[idx];
    }
    idx += 1;
    return null;
  }

  /** Parses a bundled or single `-x` / `-nval` short token. */
  function consumeShort(tok: string): string | null {
    if (tok.length < 2) return `Unexpected option token: ${tok}`;
    const shorts = tok.slice(1);
    let j = 0;

    while (j < shorts.length) {
      const shortChar = shorts[j];
      const def = findOptionDefByShort(defs, shortChar);

      if (!def) {
        if (lenientUnknown) return "";
        return `Unknown option: -${shortChar}`;
      }

      if (def.kind === CliOptionKind.Presence) {
        opts[def.name] = "1";
        j += 1;
        continue;
      }

      // Non-presence short option: cannot be bundled
      if (j !== 0 || j + 1 < shorts.length) {
        return `Short option -${shortChar} requires a value and cannot be bundled: ${tok}`;
      }

      idx += 1;
      if (idx >= argv.length) {
        return `Missing value for option: -${shortChar}`;
      }
      opts[def.name] = argv[idx];
      idx += 1;
      return null;
    }

    idx += 1;
    return null;
  }

  while (idx < argv.length) {
    const tok = argv[idx];

    if (isHelpTok(tok)) break;
    if (!tok.startsWith("-")) break;

    if (tok === "--") {
      idx += 1;
      return { report: { err: null, stoppedOnUnknown: false, sawDoubleDash: true }, nextIndex: idx };
    }

    if (tok.startsWith("--")) {
      const err = consumeLong(tok);
      if (err === "") return { report: { err: null, stoppedOnUnknown: true, sawDoubleDash: false }, nextIndex: idx };
      if (err) return { report: { err, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
    } else {
      const err = consumeShort(tok);
      if (err === "") return { report: { err: null, stoppedOnUnknown: true, sawDoubleDash: false }, nextIndex: idx };
      if (err) return { report: { err, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
    }
  }

  return { report: { err: null, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
}

// ── Positional Collection ─────────────────────────────────────────────────────

/** Fills `args` for a leaf from `startIdx` according to `node.positionals`. */
function finishLeaf(
  node: CliCommand,
  startIdx: number,
  argv: string[],
  path: string[],
  opts: Record<string, string>,
): ParseResult {
  /** Builds a parse error for positional consumption failures. */
  function errorResult(msg: string): ParseResult {
    const pr: ParseResult = {
      kind: ParseKind.Error,
      path: [],
      opts: {},
      args: [],
      helpExplicit: false,
      helpPath: [],
      errorMsg: msg,
      errorHelpPath: path,
    };
    return pr;
  }

  let idx = startIdx;
  const args: string[] = [];

  for (const p of node.positionals ?? []) {
    const { argMin = 1, argMax = 1 } = p;
    if (argMax === 1) {
      if (argMin >= 1) {
        if (idx >= argv.length) {
          return errorResult(`Missing positional argument: ${p.name}`);
        }
        args.push(argv[idx]);
        idx += 1;
      } else if (idx < argv.length) {
        args.push(argv[idx]);
        idx += 1;
      }
      continue;
    }

    let count = 0;
    if (argMax === 0) {
      while (idx < argv.length) {
        args.push(argv[idx]);
        idx += 1;
        count += 1;
      }
    } else {
      while (count < argMax && idx < argv.length) {
        args.push(argv[idx]);
        idx += 1;
        count += 1;
      }
    }
    if (count < argMin) {
      return errorResult(`Expected at least ${argMin} argument(s) for ${p.name}, got ${count}`);
    }
  }

  if (idx < argv.length) {
    return errorResult("Unexpected extra arguments");
  }

  return { kind: ParseKind.Ok, path, opts, args, helpExplicit: false, helpPath: [], errorMsg: "", errorHelpPath: [] };
}

// ── Main Parser ───────────────────────────────────────────────────────────────

/** Builds a help-request result for the current routing path. */
function helpResult(p: string[], explicit: boolean): ParseResult {
  return {
    kind: ParseKind.Help,
    path: [],
    opts: {},
    args: [],
    helpExplicit: explicit,
    helpPath: p,
    errorMsg: "",
    errorHelpPath: [],
  };
}

/**
 * Parses `argv` against the program root, routing into subcommands and filling `opts` / `args`.
 */
export function parse(root: CliCommand, argv: string[]): ParseResult {
  let i = 0;
  const path: string[] = [];
  const opts: Record<string, string> = {};

  const rootLenient =
    root.fallbackCommand !== undefined &&
    ((root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOrUnknown || (root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.UnknownOnly);

  // Consume root-level options first
  const rootRep = consumeOptions(root.options ?? [], rootLenient, argv, i, opts);
  if (rootRep.report.err) {
    return {
      kind: ParseKind.Error,
      path: [],
      opts: {},
      args: [],
      helpExplicit: false,
      helpPath: [],
      errorMsg: rootRep.report.err,
      errorHelpPath: [],
    };
  }
  i = rootRep.nextIndex;
  let forcePositionals = rootRep.report.sawDoubleDash;

  if (i < argv.length && !forcePositionals && isHelpTok(argv[i])) {
    return helpResult([], true);
  }

  // Determine which subcommand to route to
  let cmdName: string;
  let node: CliCommand | undefined;

  if (i >= argv.length) {
    if (root.fallbackCommand !== undefined && ((root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOnly || (root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOrUnknown)) {
      cmdName = root.fallbackCommand;
      node = findChild(root.commands ?? [], cmdName);
      if (!node) {
        return { kind: ParseKind.Error, path: [], opts: {}, args: [], helpExplicit: false, helpPath: [], errorMsg: `Unknown command: ${cmdName}`, errorHelpPath: path };
      }
    } else {
      return helpResult([], false);
    }
  } else {
    const peek = argv[i];
    const childPick = !forcePositionals ? findChild(root.commands ?? [], peek) : undefined;

    if (childPick !== undefined) {
      cmdName = peek;
      i += 1;
      node = childPick;
    } else {
      const canRouteUnknown =
        root.fallbackCommand !== undefined &&
        ((root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOrUnknown ||
          (root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.UnknownOnly);

      if (canRouteUnknown) {
        cmdName = root.fallbackCommand!;
        node = findChild(root.commands ?? [], cmdName);
        if (!node) {
          return { kind: ParseKind.Error, path: [], opts: {}, args: [], helpExplicit: false, helpPath: [], errorMsg: `Unknown command: ${cmdName}`, errorHelpPath: path };
        }
      } else {
        cmdName = peek;
        if (!forcePositionals) i += 1;
        node = findChild(root.commands ?? [], cmdName);
        if (!node) {
          return {
            kind: ParseKind.Error,
            path: [],
            opts: {},
            args: [],
            helpExplicit: false,
            helpPath: [],
            errorMsg: forcePositionals ? `Expected subcommand but got positional: ${cmdName}` : `Unknown command: ${cmdName}`,
            errorHelpPath: path,
          };
        }
      }
    }
  }

  path.push(cmdName);
  let current = node!;

  // Walk the command tree
  while (true) {
    if (!forcePositionals) {
      const orep = consumeOptions(current.options ?? [], false, argv, i, opts);
      if (orep.report.err) {
        return {
          kind: ParseKind.Error,
          path,
          opts: {},
          args: [],
          helpExplicit: false,
          helpPath: [],
          errorMsg: orep.report.err,
          errorHelpPath: path,
        };
      }
      i = orep.nextIndex;
      if (orep.report.sawDoubleDash) {
        forcePositionals = true;
      }
    }

    if (i < argv.length && !forcePositionals && isHelpTok(argv[i])) {
      return helpResult(path, true);
    }

    if (i >= argv.length) {
      if ((current.commands ?? []).length > 0) {
        return helpResult(path, false);
      }
      return finishLeaf(current, i, argv, path, opts);
    }

    const tok = argv[i];
    if (!forcePositionals && tok.startsWith("-")) {
      return {
        kind: ParseKind.Error,
        path,
        opts: {},
        args: [],
        helpExplicit: false,
        helpPath: [],
        errorMsg: `Unexpected option token: ${tok}`,
        errorHelpPath: path,
      };
    }

    if (!forcePositionals) {
      const childOpt = findChild(current.commands ?? [], tok);
      if (childOpt !== undefined) {
        i += 1;
        path.push(tok);
        current = childOpt;
        continue;
      }
    }

    if ((current.commands ?? []).length > 0) {
      return {
        kind: ParseKind.Error,
        path,
        opts: {},
        args: [],
        helpExplicit: false,
        helpPath: [],
        errorMsg: forcePositionals ? `Expected subcommand but got positional: ${tok}` : `Unknown subcommand: ${tok}`,
        errorHelpPath: path,
      };
    }

    return finishLeaf(current, i, argv, path, opts);
  }
}

// ── Post-Parse Validation ─────────────────────────────────────────────────────

/**
 * Validates option keys and numeric values for an Ok parse, merging in-scope options along `pr.path`.
 */
export function postParseValidate(root: CliCommand, pr: ParseResult): ParseResult {
  if (pr.kind !== ParseKind.Ok) return pr;

  let defs = [...(root.options ?? [])];
  let cmds = root.commands ?? [];

  for (const seg of pr.path) {
    const ch = findChild(cmds, seg);
    if (!ch) {
      return {
        kind: ParseKind.Error,
        path: pr.path,
        opts: {},
        args: [],
        helpExplicit: false,
        helpPath: [],
        errorMsg: "Internal path error",
        errorHelpPath: pr.path,
      };
    }
    defs.push(...(ch.options ?? []));
    cmds = ch.commands ?? [];
  }

  for (const [k, v] of Object.entries(pr.opts)) {
    const d = findOptionByName(defs, k);
    if (!d) {
      return {
        kind: ParseKind.Error,
        path: pr.path,
        opts: {},
        args: [],
        helpExplicit: false,
        helpPath: [],
        errorMsg: `Unknown option key: ${k}`,
        errorHelpPath: pr.path,
      };
    }
    if (d.kind === CliOptionKind.Number) {
      if (!fullStringIsDouble(v)) {
        return {
          kind: ParseKind.Error,
          path: pr.path,
          opts: {},
          args: [],
          helpExplicit: false,
          helpPath: [],
          errorMsg: `Invalid number for option --${k}: ${v}`,
          errorHelpPath: pr.path,
        };
      }
    }
  }

  return pr;
}
