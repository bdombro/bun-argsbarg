/*
Safe async hook runner, failure classification, and invoke error pipeline.
*/

import type { CliContext } from "~/core/context.ts";
import { LeafInputError } from "~/core/leaf-inputs.ts";
import type {
  ClientErrorOverride,
  ErrorHookContext,
  InvokeFailureKind,
  InvokeHookContext,
  ServerRuntime,
} from "~/core/types.ts";
import { firstErrorLine } from "~/http/result.ts";
import { type LogEmitter, obscureUnexpectedClientMessage } from "~/log/emitter.ts";

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
export function classifyFailureKind(
  err: unknown,
  opts: { parseError?: boolean; help?: boolean; missingConfig?: boolean; notReady?: boolean },
): InvokeFailureKind {
  if (opts.help) {
    return "help";
  }
  if (opts.missingConfig) {
    return "missing_config";
  }
  if (opts.notReady) {
    return "not_ready";
  }
  if (opts.parseError || err instanceof LeafInputError) {
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
    case "missing_config":
    case "not_ready":
      return 503;
    case "unexpected":
      return 500;
  }
}

/** Builds {@link InvokeHookContext} from a live {@link CliContext}. */
export function buildInvokeHookContext(
  ctx: CliContext,
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
    pathParams: { ...ctx.pathParams },
    opts: ctx.opts,
    locals: ctx.locals,
    runtime: extras.runtime,
    appConfig: ctx.appConfig,
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
  hooks: import("~/core/types.ts").CliProgramHooks | undefined,
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
    invocation: hookCtx.invocation,
    path: hookCtx.path.join(" "),
  });

  return { failureKind, clientError, errorMsg: displayMessage };
}
