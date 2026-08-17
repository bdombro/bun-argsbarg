/*
This module parses argv into commands, options, and positional tails.
It resolves fallback routing, tracks help requests, and shapes the parse result that
later validation and runtime dispatch both consume.

It keeps handler dispatch and help on one parser so the CLI behavior stays consistent
across every entry path.
*/

import { isCliCallable } from "../runtime/exposure.ts";
import { fullStringIsDouble } from "../utils.ts";
import { formatValidationError, validateFormatValue } from "./formats.ts";
import {
  CliFallbackMode,
  type CliLeaf,
  type CliNode,
  type CliOption,
  CliOptionKind,
  type CliRouter,
  isCliLeaf,
  isCliRouter,
  isJsonLeaf,
} from "./types.ts";

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
  /** Path parameter values from `:param` router descent (e.g. `{ id: "qa2" }`). */
  pathParams: Record<string, string>;
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
function findChild(cmds: CliNode[], name: string): CliNode | undefined {
  return cmds.find((c) => c.key === name);
}

function isParamRouterKey(key: string): boolean {
  return key.startsWith(":");
}

/** Static (non-`:param`) child by key. */
function findStaticChild(cmds: CliNode[], name: string): CliNode | undefined {
  const ch = cmds.find((c) => c.key === name);
  if (!ch || isParamRouterKey(ch.key)) {
    return undefined;
  }
  return ch;
}

/** The single `:param` router child at this level, if any. */
function findParamChild(cmds: CliNode[]): CliNode | undefined {
  return cmds.find((c) => isParamRouterKey(c.key));
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
      return {
        report: { err: null, stoppedOnUnknown: false, sawDoubleDash: true },
        nextIndex: idx,
      };
    }

    if (tok.startsWith("--")) {
      const err = consumeLong(tok);
      if (err === "")
        return {
          report: { err: null, stoppedOnUnknown: true, sawDoubleDash: false },
          nextIndex: idx,
        };
      if (err) return { report: { err, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
    } else {
      const err = consumeShort(tok);
      if (err === "")
        return {
          report: { err: null, stoppedOnUnknown: true, sawDoubleDash: false },
          nextIndex: idx,
        };
      if (err) return { report: { err, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
    }
  }

  return { report: { err: null, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
}

// ── Positional Collection ─────────────────────────────────────────────────────

/** Resolves the command node at the end of a routed path. */
function resolveNodeAtPath(root: CliNode, path: string[]): CliNode | undefined {
  if (path.length === 0) {
    return root;
  }
  let node: CliNode = root;
  for (const seg of path) {
    if (!isCliRouter(node)) {
      return undefined;
    }
    const ch = findChild(node.commands, seg);
    if (!ch) {
      return undefined;
    }
    node = ch;
  }
  return node;
}

/** Options declared on each command node along the path (root + each segment). Used for post-parse validation. */
export function collectPathOptionDefs(root: CliNode, path: string[]): CliOption[] {
  const defs = [...(root.options ?? [])];
  let node: CliNode = root;

  for (const seg of path) {
    if (!isCliRouter(node)) {
      break;
    }
    const ch = findChild(node.commands, seg);
    if (!ch) {
      break;
    }
    defs.push(...(ch.options ?? []));
    node = ch;
  }

  return defs;
}

/** Options declared on the leaf command at path (wire schemas and MCP/HTTP tool args). */
export function collectOptionDefs(root: CliNode, path: string[]): CliOption[] {
  const node = resolveNodeAtPath(root, path);
  if (!node || !isCliLeaf(node)) {
    return [];
  }
  return [...(node.options ?? [])];
}

/** Fills `args` for a json leaf from `startIdx` (0 or 1 JSON string positional). */
function finishJsonLeaf(
  _node: CliLeaf,
  startIdx: number,
  argv: string[],
  path: string[],
  opts: Record<string, string>,
  pathParams: Record<string, string>,
): ParseResult {
  let idx = startIdx;
  const args: string[] = [];

  if (idx < argv.length) {
    const tok = argv[idx];
    if (isHelpTok(tok)) {
      return helpResult(path, true, pathParams);
    }
    if (tok === "--") {
      return errorResult("Unexpected extra arguments", path, [], pathParams);
    }
    if (tok.startsWith("-")) {
      return errorResult(`JSON commands do not accept options: ${tok}`, path, [], pathParams);
    }
    args.push(tok);
    idx += 1;
  }

  if (idx < argv.length) {
    return errorResult("Unexpected extra arguments", path, [], pathParams);
  }

  return {
    kind: ParseKind.Ok,
    path,
    opts,
    args,
    pathParams,
    helpExplicit: false,
    helpPath: [],
    errorMsg: "",
    errorHelpPath: [],
  };
}

/** Fills `args` for a leaf from `startIdx` according to `node.positionals`. */
function finishLeaf(
  node: CliLeaf,
  startIdx: number,
  argv: string[],
  path: string[],
  opts: Record<string, string>,
  optionDefs: CliOption[],
  forcePositionalsIn: boolean,
  pathParams: Record<string, string>,
): ParseResult {
  let idx = startIdx;
  const args: string[] = [];
  let forcePositionals = forcePositionalsIn;

  for (const p of node.positionals ?? []) {
    const { argMin = 1, argMax = 1 } = p;
    if (argMax === 1) {
      if (argMin >= 1) {
        if (idx >= argv.length) {
          return errorResult(`Missing positional argument: ${p.name}`, path, [], pathParams);
        }
        args.push(argv[idx]);
        idx += 1;
      } else if (idx < argv.length) {
        const tok = argv[idx];
        if (argMin < 1 && tok.startsWith("-")) {
          // Optional slot: leave `-` tokens for trailing option parsing.
        } else {
          args.push(tok);
          idx += 1;
        }
      }
      continue;
    }

    let count = 0;
    if (argMax === 0) {
      while (idx < argv.length) {
        const tok = argv[idx];

        if (!forcePositionals && tok === "--") {
          forcePositionals = true;
          idx++;
          continue;
        }

        if (!forcePositionals && isHelpTok(tok)) {
          return helpResult(path, true, pathParams);
        }

        if (!forcePositionals && tok.startsWith("-")) {
          // MUST be false — lenient mode swallows unknown flags as positionals silently
          const tailRep = consumeOptions(optionDefs, false, argv, idx, opts);
          if (tailRep.report.err) {
            return errorResult(tailRep.report.err, path, [], pathParams);
          }
          if (tailRep.report.sawDoubleDash) {
            forcePositionals = true;
          }
          if (tailRep.nextIndex > idx) {
            idx = tailRep.nextIndex;
            continue;
          }
          return errorResult(`Unexpected option token: ${tok}`, path, [], pathParams);
        }

        args.push(tok);
        idx++;
        count++;
      }
    } else {
      while (count < argMax && idx < argv.length) {
        args.push(argv[idx]);
        idx += 1;
        count += 1;
      }
    }
    if (count < argMin) {
      return errorResult(`Expected at least ${argMin} argument(s) for ${p.name}, got ${count}`, path, [], pathParams);
    }
  }

  if (idx < argv.length) {
    if (forcePositionals) {
      return errorResult("Unexpected extra arguments", path, [], pathParams);
    }

    if (isHelpTok(argv[idx])) {
      return helpResult(path, true, pathParams);
    }

    const tailRep = consumeOptions(optionDefs, false, argv, idx, opts);
    if (tailRep.report.err) {
      return errorResult(tailRep.report.err, path, [], pathParams);
    }
    idx = tailRep.nextIndex;

    if (idx < argv.length) {
      return errorResult("Unexpected extra arguments", path, [], pathParams);
    }
  }

  return {
    kind: ParseKind.Ok,
    path,
    opts,
    args,
    pathParams,
    helpExplicit: false,
    helpPath: [],
    errorMsg: "",
    errorHelpPath: [],
  };
}

// ── Main Parser ───────────────────────────────────────────────────────────────

/** Builds a user-error parse result; `path` defaults to `errorHelpPath`. */
function errorResult(
  errorMsg: string,
  errorHelpPath: string[] = [],
  path: string[] = errorHelpPath,
  pathParams: Record<string, string> = {},
): ParseResult {
  return {
    kind: ParseKind.Error,
    path,
    opts: {},
    args: [],
    pathParams,
    helpExplicit: false,
    helpPath: [],
    errorMsg,
    errorHelpPath,
  };
}

/** Builds a help-request result for the current routing path. */
function helpResult(p: string[], explicit: boolean, pathParams: Record<string, string> = {}): ParseResult {
  return {
    kind: ParseKind.Help,
    path: [],
    opts: {},
    args: [],
    pathParams,
    helpExplicit: explicit,
    helpPath: p,
    errorMsg: "",
    errorHelpPath: [],
  };
}

type DescendResult = { ok: true; node: CliNode; cliEnabled: boolean } | { ok: false; error: ParseResult };

/** Descends into a static or `:param` child, updating path and pathParams. */
function descendChild(
  parent: CliRouter,
  tok: string,
  path: string[],
  pathParams: Record<string, string>,
  cliEnabled: boolean,
): DescendResult {
  const staticChild = findStaticChild(parent.commands, tok);
  if (staticChild) {
    if (!isCliCallable(staticChild, cliEnabled)) {
      return { ok: false, error: errorResult(`Unknown subcommand: ${tok}`, path, [], pathParams) };
    }
    path.push(tok);
    return { ok: true, node: staticChild, cliEnabled: isCliCallable(staticChild, cliEnabled) };
  }

  const paramChild = findParamChild(parent.commands);
  if (paramChild && isCliCallable(paramChild, cliEnabled)) {
    const paramName = paramChild.key.slice(1);
    path.push(paramChild.key);
    pathParams[paramName] = tok;
    return { ok: true, node: paramChild, cliEnabled: isCliCallable(paramChild, cliEnabled) };
  }

  return { ok: false, error: errorResult(`Unknown subcommand: ${tok}`, path, [], pathParams) };
}

/**
 * Parses `argv` against the program root, routing into subcommands and filling `opts` / `args`.
 */
export function parse(root: CliNode, argv: string[]): ParseResult {
  let i = 0;
  const path: string[] = [];
  const pathParams: Record<string, string> = {};
  const opts: Record<string, string> = {};
  let cliEnabled = true;

  const rootLenient =
    isCliRouter(root) &&
    root.fallbackCommand !== undefined &&
    ((root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOrUnknown ||
      (root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.UnknownOnly);

  // Consume root-level options first
  const rootRep = consumeOptions(root.options ?? [], rootLenient, argv, i, opts);
  if (rootRep.report.err) {
    return errorResult(rootRep.report.err);
  }
  i = rootRep.nextIndex;
  let forcePositionals = rootRep.report.sawDoubleDash;

  if (i < argv.length && !forcePositionals && isHelpTok(argv[i])) {
    return helpResult([], true);
  }

  // Determine which subcommand to route to
  let cmdName: string;
  let node: CliNode | undefined;

  if (isCliLeaf(root)) {
    if (isJsonLeaf(root)) {
      return finishJsonLeaf(root, i, argv, path, opts, pathParams);
    }
    return finishLeaf(root, i, argv, path, opts, root.options ?? [], forcePositionals, pathParams);
  }

  if (i >= argv.length) {
    if (
      root.fallbackCommand !== undefined &&
      ((root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOnly ||
        (root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOrUnknown)
    ) {
      cmdName = root.fallbackCommand;
      node = findChild(root.commands, cmdName);
      if (!node) {
        return errorResult(`Unknown command: ${cmdName}`, path, []);
      }
    } else {
      return helpResult([], false);
    }
  } else {
    const peek = argv[i];
    const childPick = !forcePositionals ? findStaticChild(root.commands, peek) : undefined;

    if (childPick !== undefined) {
      if (!isCliCallable(childPick, cliEnabled)) {
        return errorResult(`Unknown command: ${peek}`, path, [], pathParams);
      }
      cmdName = peek;
      i += 1;
      node = childPick;
      cliEnabled = isCliCallable(childPick, cliEnabled);
    } else if (!forcePositionals && isCliRouter(root)) {
      const paramChild = findParamChild(root.commands);
      if (paramChild && isCliCallable(paramChild, cliEnabled)) {
        cmdName = paramChild.key;
        pathParams[paramChild.key.slice(1)] = peek;
        i += 1;
        node = paramChild;
        cliEnabled = isCliCallable(paramChild, cliEnabled);
      } else {
        const fallbackCommand = root.fallbackCommand;
        const canRouteUnknown =
          fallbackCommand !== undefined &&
          ((root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOrUnknown ||
            (root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.UnknownOnly);

        if (canRouteUnknown) {
          cmdName = fallbackCommand;
          node = findChild(root.commands, cmdName);
          if (!node) {
            return errorResult(`Unknown command: ${cmdName}`, path, [], pathParams);
          }
        } else {
          return errorResult(`Unknown command: ${peek}`, path, [], pathParams);
        }
      }
    } else {
      const fallbackCommand = root.fallbackCommand;
      const canRouteUnknown =
        fallbackCommand !== undefined &&
        ((root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.MissingOrUnknown ||
          (root.fallbackMode ?? CliFallbackMode.MissingOnly) === CliFallbackMode.UnknownOnly);

      if (canRouteUnknown) {
        cmdName = fallbackCommand;
        node = findChild(root.commands, cmdName);
        if (!node) {
          return errorResult(`Unknown command: ${cmdName}`, path, []);
        }
      } else {
        cmdName = peek;
        if (!forcePositionals) i += 1;
        node = findChild(root.commands, cmdName);
        if (!node) {
          return errorResult(
            forcePositionals ? `Expected subcommand but got positional: ${cmdName}` : `Unknown command: ${cmdName}`,
            path,
            [],
          );
        }
      }
    }
  }

  path.push(cmdName);
  if (!node) {
    return errorResult(`Unknown command: ${cmdName}`, path);
  }
  let current = node;

  // Walk the command tree
  while (true) {
    if (isCliLeaf(current) && isJsonLeaf(current)) {
      return finishJsonLeaf(current, i, argv, path, opts, pathParams);
    }

    if (!forcePositionals) {
      const orep = consumeOptions(current.options ?? [], false, argv, i, opts);
      if (orep.report.err) {
        return errorResult(orep.report.err, path);
      }
      i = orep.nextIndex;
      if (orep.report.sawDoubleDash) {
        forcePositionals = true;
      }
    }

    if (i < argv.length && !forcePositionals && isHelpTok(argv[i])) {
      return helpResult(path, true, pathParams);
    }

    if (i >= argv.length) {
      if (isCliRouter(current) && current.commands.length > 0) {
        const fb = current.fallbackCommand;
        const fm = current.fallbackMode ?? CliFallbackMode.MissingOnly;
        if (fb !== undefined && (fm === CliFallbackMode.MissingOnly || fm === CliFallbackMode.MissingOrUnknown)) {
          const fbNode = findChild(current.commands, fb);
          if (fbNode) {
            path.push(fb);
            current = fbNode;
            cliEnabled = isCliCallable(fbNode, cliEnabled);
            continue;
          }
        }
        return helpResult(path, false, pathParams);
      }
      if (!isCliLeaf(current)) {
        return helpResult(path, false, pathParams);
      }
      return finishLeaf(current, i, argv, path, opts, current.options ?? [], forcePositionals, pathParams);
    }

    const tok = argv[i];
    if (!forcePositionals && tok.startsWith("-")) {
      return errorResult(`Unexpected option token: ${tok}`, path, [], pathParams);
    }

    if (!forcePositionals && isCliRouter(current)) {
      const descended = descendChild(current, tok, path, pathParams, cliEnabled);
      if (descended.ok) {
        i += 1;
        current = descended.node;
        cliEnabled = descended.cliEnabled;
        continue;
      }
    }

    if (isCliRouter(current) && current.commands.length > 0) {
      const fb = current.fallbackCommand;
      const fm = current.fallbackMode ?? CliFallbackMode.MissingOnly;
      const canRouteUnknown =
        fb !== undefined && (fm === CliFallbackMode.MissingOrUnknown || fm === CliFallbackMode.UnknownOnly);

      if (canRouteUnknown && fb !== undefined) {
        const fbNode = findChild(current.commands, fb);
        if (fbNode) {
          path.push(fb);
          current = fbNode;
          cliEnabled = isCliCallable(fbNode, cliEnabled);
          continue;
        }
      }

      return errorResult(
        forcePositionals ? `Expected subcommand but got positional: ${tok}` : `Unknown subcommand: ${tok}`,
        path,
        [],
        pathParams,
      );
    }

    if (!isCliLeaf(current)) {
      return helpResult(path, false, pathParams);
    }
    return finishLeaf(current, i, argv, path, opts, current.options ?? [], forcePositionals, pathParams);
  }
}

// ── Post-Parse Validation ─────────────────────────────────────────────────────

/**
 * Validates option keys and numeric values for an Ok parse along `pr.path`.
 */
export function postParseValidate(root: CliNode, pr: ParseResult): ParseResult {
  if (pr.kind !== ParseKind.Ok) return pr;

  const defs = collectPathOptionDefs(root, pr.path);

  const opts = { ...pr.opts };
  for (const d of defs) {
    if (d.default !== undefined && !(d.name in opts)) {
      opts[d.name] = d.default;
    }
  }

  for (const d of defs) {
    if (d.required && !(d.name in opts)) {
      if (d.kind === CliOptionKind.Json) {
        continue;
      }
      return errorResult(`Missing required option: --${d.name}`, pr.path);
    }
  }

  for (const [k, v] of Object.entries(opts)) {
    const d = findOptionByName(defs, k);
    if (!d) {
      return errorResult(`Unknown option key: ${k}`, pr.path);
    }
    if (d.kind === CliOptionKind.Json) {
      try {
        JSON.parse(v);
      } catch {
        return errorResult(`Invalid JSON for option --${k}`, pr.path);
      }
      continue;
    }
    if (d.kind === CliOptionKind.Number) {
      if (!fullStringIsDouble(v)) {
        return errorResult(`Invalid number for option --${k}: ${v}`, pr.path);
      }
    }
    if (d.kind === CliOptionKind.Enum) {
      const choices = d.choices ?? [];
      if (!choices.includes(v)) {
        return errorResult(`Option --${k}: '${v}' is not one of: ${choices.join(", ")}`, pr.path);
      }
    }
    if (d.kind === CliOptionKind.String && (d.format !== undefined || d.pattern !== undefined)) {
      try {
        validateFormatValue(v, d.format, d.pattern);
      } catch (err) {
        const msg =
          d.format !== undefined
            ? formatValidationError(d.format, v)
            : err instanceof Error
              ? err.message
              : String(err);
        return errorResult(`Invalid value for option --${k}: ${msg}`, pr.path);
      }
    }
  }

  return { ...pr, opts };
}
