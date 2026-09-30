/*
Safe async hook runner, built-in path detection (hooks skip framework commands),
failure classification, and the invoke error pipeline.
*/

import type { CommandContext } from "../core/context.ts";
import { InputError } from "../core/leaf-inputs.ts";
import type {
  ClientErrorOverride,
  ErrorHookContext,
  InvokeFailureKind,
  InvokeHookContext,
  ServerRuntime,
} from "../core/types.ts";
import { firstErrorLine } from "../http/result.ts";
import { type LogEmitter, obscureUnexpectedClientMessage } from "../log/emitter.ts";
import type { Capabilities } from "./capabilities.ts";

/** Root command keys owned by argsbarg built-ins. */
const BUILTIN_ROOTS = new Set(["completion", "version", "http", "mcp"]);

/** True when `path` routes to a framework built-in (hooks are skipped). */
export function isBuiltinInvokePath(
  /** Routed command path. */
  path: string[],
  /** Active capabilities; a disabled built-in's name belongs to the app. */
  caps: Capabilities,
): boolean {
  const root = path[0];
  if (!root || !BUILTIN_ROOTS.has(root)) {
    return false;
  }
  if ((root === "completion" && !caps.completion) || (root === "http" && !caps.http) || (root === "mcp" && !caps.mcp)) {
    return false;
  }
  if (root === "http") {
    return path.length <= 1 || path[1] === "serve";
  }
  if (root === "mcp") {
    return path.length <= 1 || path[1] === "serve" || path[1] === "bundle";
  }
  return true;
}

/** Runs a hook without letting hook throws escape uncaught. */
export async function runHook<T>(hook: (() => T | Promise<T>) | undefined, label: string): Promise<T | undefined> {
  if (!hook) {
    return undefined;
  }
  try {
    return await Promise.resolve(hook());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} hook failed: ${message}`, { cause: err });
  }
}

/** Classifies an invoke failure for status mapping and logging. */
export function classifyFailureKind(err: unknown, opts: { parseError?: boolean; help?: boolean }): InvokeFailureKind {
  if (opts.help) {
    return "help";
  }
  if (opts.parseError || err instanceof InputError) {
    return "validation";
  }
  if (err instanceof Error) {
    return "validation";
  }
  return "unexpected";
}

/** HTTP status for a classified failure kind. */
export function failureKindHttpStatus(kind: InvokeFailureKind): number {
  switch (kind) {
    case "validation":
    case "help":
      return 400;
    case "unknown_route":
      return 404;
    case "unexpected":
      return 500;
  }
}

/** Builds {@link InvokeHookContext} from a live {@link CommandContext}. */
export function buildInvokeHookContext(
  ctx: CommandContext,
  extras: {
    path: string[];
    runtime?: ServerRuntime;
    http?: InvokeHookContext["http"];
    mcp?: InvokeHookContext["mcp"];
  },
): InvokeHookContext {
  return {
    invocation: ctx.invocation,
    path: extras.path,
    pathParams: { ...ctx.rawPathParams },
    opts: ctx.opts,
    locals: ctx.locals,
    runtime: extras.runtime,
    http: extras.http,
    mcp: extras.mcp,
  };
}

function defaultClientError(err: unknown, _failureKind: InvokeFailureKind): ClientErrorOverride {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : firstErrorLine(String(err)) || "Error";
  return { message, exitCode: 1 };
}

export interface ErrorPipelineResult {
  failureKind: InvokeFailureKind;
  clientError: ClientErrorOverride;
  errorMsg: string;
}

/** Runs formatError → onError → ECS emit for one invoke failure. */
export async function runErrorPipeline(
  hookCtx: InvokeHookContext,
  err: unknown,
  failureKind: InvokeFailureKind,
  hooks: import("../core/types.ts").AppHooks | undefined,
  emitter: LogEmitter | undefined,
  obscureUnexpected: boolean,
): Promise<ErrorPipelineResult> {
  let clientError = defaultClientError(err, failureKind);
  if (failureKind === "unexpected" && obscureUnexpected) {
    clientError = { message: obscureUnexpectedClientMessage(), exitCode: 1 };
  }

  const errorCtx: ErrorHookContext = {
    ...hookCtx,
    failureKind,
    error: err,
    clientError: { ...clientError },
  };

  const formatted = await runHook(() => hooks?.formatError?.(errorCtx), "formatError");
  if (formatted) {
    clientError = { ...clientError, ...formatted };
    errorCtx.clientError = { ...clientError };
  }

  await runHook(() => hooks?.onError?.(errorCtx), "onError");

  const displayMessage =
    failureKind === "unexpected" && obscureUnexpected ? obscureUnexpectedClientMessage() : clientError.message;

  emitter?.emitInvokeError(failureKind, err, displayMessage, {
    labels: {
      invocation: hookCtx.invocation,
      path: hookCtx.path.join(" "),
    },
    requestId: hookCtx.locals.requestId,
    traceId: hookCtx.http?.traceId,
    spanId: hookCtx.http?.spanId,
  });

  return { failureKind, clientError, errorMsg: displayMessage };
}
