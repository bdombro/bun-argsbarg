/*
Leaf input reads: Json options (flag, preloaded stdin, or toolArgs), optional Zod inputSchema validation.
With an inputSchema, the schema's parsed output becomes ctx.inputs.
*/

import type { z } from "zod";
import { isInteractiveTty } from "../utils.ts";
import type { CommandContext, CommandInputs } from "./context.ts";
import { collectOptionDefs } from "./parse.ts";
import type { AppSpec, Command, CommandOption, Invocation, RunnableCommand } from "./types.ts";
import { hasHandler, hasSubcommands, isDocumentCommand, OptionKind, ValueFormat } from "./types.ts";
import { toJsonSchema, validateWithSchema } from "./zod-schema.ts";

/** Thrown when leaf input resolution or validation fails. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/** Internal key for piped stdin on `kind: "document"` leaves. */
export const DOCUMENT_LEAF_BODY_KEY = "__documentLeafBody";

function resolveLeaf(program: AppSpec, commandPath: string[]): RunnableCommand | undefined {
  let node: Command = program;
  for (const seg of commandPath) {
    if (!hasSubcommands(node)) return undefined;
    const child = node.commands.find((c) => c.key === seg);
    if (!child) return undefined;
    node = child;
  }
  return hasHandler(node) ? node : undefined;
}

function leafNode(ctx: CommandContext): RunnableCommand | undefined {
  return resolveLeaf(ctx.spec, ctx.commandPath);
}

/** Parses a JSON string from a `--name` flag value. */
export function parseJsonText(
  /** Raw text to parse as JSON. */
  raw: string,
  /** Field or argument label for error reporting. */
  label: string,
): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InputError(`${label}: JSON value is empty`);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new InputError(`${label}: invalid JSON`);
  }
}

/** Parses a JSON or YAML string from a command argument or document body. */
export function parseDocumentText(
  /** Raw text containing a JSON or YAML document. */
  raw: string,
  /** Field or argument label for error reporting. */
  label: string,
): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InputError(`${label}: value is empty`);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to YAML if JSON parse fails
    }
  }
  try {
    return Bun.YAML.parse(trimmed);
  } catch {
    throw new InputError(`${label}: invalid JSON or YAML`);
  }
}

async function readPipedJsonStdin(): Promise<unknown> {
  const raw = await new Response(Bun.stdin).text();
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InputError("stdin is empty; pass JSON via the option flag or pipe a JSON document to stdin");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new InputError("stdin is not valid JSON");
  }
}

/** Error message when a document leaf gets no input. */
const DOCUMENT_BODY_HELP = "Missing document input: pass a JSON or YAML document as an argument or pipe to stdin";

/** Reads piped stdin for a document command with a handler. */
async function readPipedDocumentStdin(): Promise<unknown> {
  const raw = await new Response(Bun.stdin).text();
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InputError(DOCUMENT_BODY_HELP);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to YAML
    }
  }
  try {
    return Bun.YAML.parse(trimmed);
  } catch {
    throw new InputError("stdin is not valid JSON or YAML");
  }
}

function pipableJsonHelp(opt: CommandOption): string {
  return `Missing required option --${opt.name}: pass JSON via --${opt.name} '<json>' or pipe a JSON document to stdin`;
}

function omitUndefinedInputs(out: CommandInputs): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(out)) {
    if (value !== undefined) {
      stripped[key] = value;
    }
  }
  return stripped;
}

/** Validates collected inputs against the leaf's Zod `inputSchema` and returns the parsed value. */
function validateAgainstInputSchema(
  /** Collected leaf inputs (undefined values are dropped before validation). */
  out: CommandInputs,
  /** Leaf `inputSchema`. */
  inputSchema: z.ZodType,
): unknown {
  const result = validateWithSchema(inputSchema, omitUndefinedInputs(out));
  if (!result.valid) {
    throw new InputError(result.errors.join("; "));
  }
  return result.value;
}

/** Resolves a Json option from argv, preloaded stdin, or toolArgs (flag wins). */
export function readJsonOptionValue(ctx: CommandContext, name: string): unknown | undefined {
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
 * Call from {@link App.run} before constructing the handler context.
 */
export async function preloadPipableJson(
  program: AppSpec,
  commandPath: string[],
  opts: Record<string, string>,
  invocation: Invocation,
  args: string[] = [],
): Promise<Record<string, unknown>> {
  if (invocation !== "cli" || isInteractiveTty) {
    return {};
  }

  const leaf = resolveLeaf(program, commandPath);
  if (leaf && isDocumentCommand(leaf) && args.length === 0) {
    return { [DOCUMENT_LEAF_BODY_KEY]: await readPipedDocumentStdin() };
  }

  for (const opt of collectOptionDefs(program, commandPath)) {
    if (opt.kind === OptionKind.Json && opt.pipable && !(opt.name in opts)) {
      return { [opt.name]: await readPipedJsonStdin() };
    }
  }
  return {};
}

function readSyncOptionValue(
  ctx: CommandContext,
  opt: CommandOption,
): boolean | number | string | string[] | unknown | undefined {
  if (opt.kind === OptionKind.Presence) {
    return ctx.hasFlag(opt.name);
  }
  if (opt.kind === OptionKind.Number) {
    const n = ctx.numberOpt(opt.name);
    return n === null ? undefined : n;
  }
  if (opt.kind === OptionKind.Json) {
    return readJsonOptionValue(ctx, opt.name);
  }
  if (opt.format !== undefined) {
    if (opt.format === ValueFormat.Duration) {
      return ctx.durationOpt(opt.name);
    }
    if (opt.format === ValueFormat.CommaList) {
      return ctx.commaListOpt(opt.name);
    }
    if (opt.format === ValueFormat.Date) {
      return ctx.dateOpt(opt.name);
    }
    if (opt.format === ValueFormat.DateTime) {
      return ctx.dateTimeOpt(opt.name);
    }
  }
  return ctx.stringOpt(opt.name);
}

/**
 * Loads coerced leaf inputs and validates against `leaf.inputSchema` when set.
 * Used by {@link CommandContext.inputs}; handlers read `ctx.inputs`.
 */
export function loadLeafInputs(ctx: CommandContext): unknown {
  const leaf = leafNode(ctx);
  if (!leaf) return {};

  if (isDocumentCommand(leaf)) {
    let body: unknown;
    if (ctx.toolArgs !== undefined) {
      body = ctx.toolArgs;
    } else if (ctx.args.length > 0) {
      const [arg0] = ctx.args;
      if (arg0 === undefined) {
        throw new InputError(DOCUMENT_BODY_HELP);
      }
      body = parseDocumentText(arg0, "Document argument");
    } else if (DOCUMENT_LEAF_BODY_KEY in ctx.preloadedJson) {
      body = ctx.preloadedJson[DOCUMENT_LEAF_BODY_KEY];
    } else {
      throw new InputError(DOCUMENT_BODY_HELP);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new InputError("Document input must be a JSON or YAML object");
    }
    const out = body as CommandInputs;
    if (leaf.inputSchema !== undefined) {
      return validateWithPathParams(out, leaf.inputSchema, ctx.rawPathParams);
    }
    return omitUndefinedInputs(out);
  }

  const out: CommandInputs = {};
  const options = collectOptionDefs(ctx.spec, ctx.commandPath);

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

  const pathOnly: Record<string, string> = {};
  for (const [name, value] of Object.entries(ctx.rawPathParams)) {
    if (out[name] === undefined) {
      out[name] = value;
      pathOnly[name] = value;
    }
  }

  if (ctx.toolArgs !== undefined) {
    for (const [key, value] of Object.entries(ctx.toolArgs)) {
      if (out[key] === undefined) {
        out[key] = value;
      }
    }
  }

  for (const opt of options) {
    if (opt.required && out[opt.name] === undefined) {
      if (opt.kind === OptionKind.Json && opt.pipable && ctx.invocation === "cli" && isInteractiveTty) {
        throw new InputError(pipableJsonHelp(opt));
      }
      throw new InputError(`Missing required option: --${opt.name}`);
    }
  }

  if (leaf.inputSchema !== undefined) {
    return validateWithPathParams(out, leaf.inputSchema, pathOnly);
  }

  return omitUndefinedInputs(out);
}

/**
 * Validates inputs whose path parameters (`:id` routers) aren't declared by the schema: those keys are left out
 * of validation (they are URL segments, not body fields) and merged back into the parsed object afterwards.
 */
function validateWithPathParams(
  /** Collected leaf inputs, including path parameters. */
  out: CommandInputs,
  /** Leaf `inputSchema`. */
  inputSchema: z.ZodType,
  /** Path parameters that no option or positional supplied. */
  pathOnly: Record<string, string>,
): unknown {
  const declared = toJsonSchema(inputSchema, "input").properties;
  const undeclared = Object.keys(pathOnly).filter(
    (name) => typeof declared !== "object" || declared === null || !(name in declared),
  );
  if (undeclared.length === 0) {
    return validateAgainstInputSchema(out, inputSchema);
  }
  const body: CommandInputs = { ...out };
  for (const name of undeclared) delete body[name];
  const parsed = validateAgainstInputSchema(body, inputSchema);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return parsed;
  }
  const merged: Record<string, unknown> = { ...parsed };
  for (const name of undeclared) {
    if (merged[name] === undefined) merged[name] = pathOnly[name];
  }
  return merged;
}
