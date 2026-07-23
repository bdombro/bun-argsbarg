/*
Leaf input reads: Json options (flag, preloaded stdin, or toolArgs), optional inputSchema validation.
*/

import { validateConfigDocument } from "./config/validate.ts";
import type { CliContext, CliLeafInputs } from "./context.ts";
import { collectOptionDefs } from "./parse.ts";
import type { CliInvocation, CliLeaf, CliNode, CliOption, CliProgram } from "./types.ts";
import { CliOptionKind, CliValueFormat, isCliLeaf, isCliRouter } from "./types.ts";
import { isInteractiveTty } from "./utils.ts";

/** Thrown when leaf input resolution or validation fails. */
export class LeafInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeafInputError";
  }
}

function leafNode(ctx: CliContext): CliLeaf | undefined {
  let node: CliNode = ctx.program;
  for (const seg of ctx.commandPath) {
    if (!isCliRouter(node)) return undefined;
    const child = node.commands.find((c) => c.key === seg);
    if (!child) return undefined;
    node = child;
  }
  return isCliLeaf(node) ? node : undefined;
}

/** Parses a JSON string from a `--name` flag value. */
export function parseJsonText(raw: string, label: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new LeafInputError(`${label}: JSON value is empty`);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new LeafInputError(`${label}: invalid JSON`);
  }
}

async function readPipedJsonStdin(): Promise<unknown> {
  const raw = await new Response(Bun.stdin).text();
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new LeafInputError("stdin is empty; pass JSON via the option flag or pipe a JSON document to stdin");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new LeafInputError("stdin is not valid JSON");
  }
}

function pipableJsonHelp(opt: CliOption): string {
  return `Missing required option --${opt.name}: pass JSON via --${opt.name} '<json>' or pipe a JSON document to stdin`;
}

function omitUndefinedInputs(out: CliLeafInputs): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(out)) {
    if (value !== undefined) {
      stripped[key] = value;
    }
  }
  return stripped;
}

function validateAgainstInputSchema(out: CliLeafInputs, inputSchema: Record<string, unknown>): void {
  const result = validateConfigDocument(omitUndefinedInputs(out), inputSchema);
  if (!result.valid) {
    throw new LeafInputError(result.errors.join("; "));
  }
}

/** Resolves a Json option from argv, preloaded stdin, or toolArgs (flag wins). */
export function readJsonOptionValue(ctx: CliContext, name: string): unknown | undefined {
  const flagValue = ctx.stringOpt(name);
  if (flagValue !== undefined) {
    return parseJsonText(flagValue, `--${name}`);
  }
  if (name in ctx.preloadedJson) {
    return ctx.preloadedJson[name];
  }
  if (ctx.toolArgs !== undefined && name in ctx.toolArgs) {
    return ctx.toolArgs[name];
  }
  return undefined;
}

/**
 * Reads piped stdin for a pipable Json option when the flag is omitted (CLI only).
 * Call from {@link Cli.run} before constructing the handler context.
 */
export async function preloadPipableJson(
  program: CliProgram,
  commandPath: string[],
  opts: Record<string, string>,
  invocation: CliInvocation,
): Promise<Record<string, unknown>> {
  if (invocation !== "cli" || isInteractiveTty) {
    return {};
  }
  for (const opt of collectOptionDefs(program, commandPath)) {
    if (opt.kind === CliOptionKind.Json && opt.pipable && !(opt.name in opts)) {
      return { [opt.name]: await readPipedJsonStdin() };
    }
  }
  return {};
}

function readSyncOptionValue(
  ctx: CliContext,
  opt: CliOption,
): boolean | number | string | string[] | unknown | undefined {
  if (opt.kind === CliOptionKind.Presence) {
    return ctx.hasFlag(opt.name);
  }
  if (opt.kind === CliOptionKind.Number) {
    const n = ctx.numberOpt(opt.name);
    return n === null ? undefined : n;
  }
  if (opt.kind === CliOptionKind.Json) {
    return readJsonOptionValue(ctx, opt.name);
  }
  if (opt.format !== undefined) {
    if (opt.format === CliValueFormat.Duration) {
      return ctx.durationOpt(opt.name);
    }
    if (opt.format === CliValueFormat.CommaList) {
      return ctx.commaListOpt(opt.name);
    }
    if (opt.format === CliValueFormat.Date) {
      return ctx.dateOpt(opt.name);
    }
    if (opt.format === CliValueFormat.DateTime) {
      return ctx.dateTimeOpt(opt.name);
    }
  }
  return ctx.stringOpt(opt.name);
}

/**
 * Loads coerced leaf inputs and validates against `leaf.inputSchema` when set.
 * Used by {@link CliContext.inputs}; prefer `ctx.inputs` or `ctx.inputsAs()` in handlers.
 */
export function loadLeafInputs(ctx: CliContext): CliLeafInputs {
  const leaf = leafNode(ctx);
  if (!leaf) return {};

  const out: CliLeafInputs = {};
  const options = collectOptionDefs(ctx.program, ctx.commandPath);

  for (const opt of options) {
    out[opt.name] = readSyncOptionValue(ctx, opt);
  }

  for (const p of leaf.positionals ?? []) {
    const val = ctx.positional(p.name);
    if (val === undefined) {
      out[p.name] = undefined;
    } else if (Array.isArray(val)) {
      out[p.name] = val;
    } else {
      out[p.name] = val;
    }
  }

  for (const opt of options) {
    if (opt.required && out[opt.name] === undefined) {
      if (opt.kind === CliOptionKind.Json && opt.pipable && ctx.invocation === "cli" && isInteractiveTty) {
        throw new LeafInputError(pipableJsonHelp(opt));
      }
      throw new LeafInputError(`Missing required option: --${opt.name}`);
    }
  }

  if (leaf.inputSchema !== undefined) {
    validateAgainstInputSchema(out, leaf.inputSchema);
  }

  return omitUndefinedInputs(out);
}

/** @deprecated Use {@link CliContext.inputs} or {@link loadLeafInputs} via `ctx.inputs`. */
export function readLeafInputs(ctx: CliContext): CliLeafInputs {
  return ctx.inputs;
}

/** @deprecated Use sync {@link readLeafInputs} — stdin is preloaded before the handler runs. */
export function readLeafInputsAsync(ctx: CliContext): Promise<CliLeafInputs> {
  return Promise.resolve(readLeafInputs(ctx));
}
