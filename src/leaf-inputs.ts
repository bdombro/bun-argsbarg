/*
Async leaf input reads: Json options (flag, piped stdin, or toolArgs), optional inputSchema validation.
*/

import { validateConfigDocument } from "./config/validate.ts";
import type { CliContext, CliLeafInputs } from "./context.ts";
import { collectOptionDefs } from "./parse.ts";
import type { CliLeaf, CliNode, CliOption } from "./types.ts";
import { CliOptionKind, CliValueFormat, isCliLeaf, isCliRouter } from "./types.ts";
import { isInteractiveTty } from "./utils.ts";

/** Thrown when {@link CliContext.readLeafInputsAsync} cannot resolve or validate inputs. */
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
    const raw = ctx.stringOpt(opt.name);
    if (raw === undefined) return undefined;
    return parseJsonText(raw, `--${opt.name}`);
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

function parseJsonText(raw: string, label: string): unknown {
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

/**
 * Reads coerced leaf inputs, resolving Json options from flags, piped stdin, or toolArgs,
 * and validates against `leaf.inputSchema` when set.
 */
export async function readLeafInputsAsync(ctx: CliContext): Promise<CliLeafInputs> {
  const leaf = leafNode(ctx);
  if (!leaf) return {};

  const out: CliLeafInputs = {};
  const options = collectOptionDefs(ctx.program, ctx.commandPath);
  let pipedJson: unknown | undefined;
  let pipedJsonRead = false;

  for (const opt of options) {
    if (opt.kind === CliOptionKind.Json) {
      const flagValue = ctx.stringOpt(opt.name);
      if (flagValue !== undefined) {
        out[opt.name] = parseJsonText(flagValue, `--${opt.name}`);
        continue;
      }
      if (ctx.toolArgs !== undefined && opt.name in ctx.toolArgs) {
        out[opt.name] = ctx.toolArgs[opt.name];
        continue;
      }
      if (opt.pipable && ctx.invocation === "cli") {
        if (isInteractiveTty) {
          out[opt.name] = undefined;
          continue;
        }
        if (!pipedJsonRead) {
          pipedJson = await readPipedJsonStdin();
          pipedJsonRead = true;
        }
        out[opt.name] = pipedJson;
        continue;
      }
      out[opt.name] = undefined;
      continue;
    }

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
