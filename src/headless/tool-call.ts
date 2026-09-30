/*
Shared headless tool dispatch for MCP and HTTP: tool lookup, argv conversion, and invoke.
*/

import type { AppSpec, Invocation, InvokeFailureKind } from "../core/types.ts";
import { apiErrorResponse, apiSuccessResponse, stripAnsi } from "../http/result.ts";
import { type HttpRouteDef, httpRequestToArgv } from "../http/routes.ts";
import { obscureUnexpectedClientMessage } from "../log/emitter.ts";
import { buildToolCallSuccessFromResponse } from "../mcp/result.ts";
import {
  collectMcpTools,
  MCP_INPUT_WRAPPER_KEY,
  MCP_OUTPUT_WRAPPER_KEY,
  type McpToolDef,
  mcpToolCallToArgv,
} from "../mcp/tools.ts";
import type { App, InvokeResult } from "../runtime/cli.ts";
import { failureKindHttpStatus } from "../runtime/hooks.ts";

/** Outcome of resolving a tool name against the program schema. */
export type ToolLookupResult = { ok: true; tool: McpToolDef } | { ok: false; kind: "unknown"; message: string };

/** Successful headless tool invocation payload shared by MCP and HTTP. */
export interface HeadlessToolCallSuccess {
  ok: true;
  response: NonNullable<InvokeResult["response"]>;
  mcpResult: ReturnType<typeof buildToolCallSuccessFromResponse>;
}

/** Failed headless tool invocation payload shared by MCP and HTTP. */
export interface HeadlessToolCallFailure {
  ok: false;
  kind: "argv" | "invoke" | "help";
  message: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  failureKind?: InvokeFailureKind;
  invokeResult?: InvokeResult;
}

export type HeadlessToolCallResult = HeadlessToolCallSuccess | HeadlessToolCallFailure;

/** Finds an exposed MCP tool by name. */
export function lookupHeadlessTool(program: AppSpec, toolName: string): ToolLookupResult {
  const tools = collectMcpTools(program);
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return { ok: false, kind: "unknown", message: `Unknown tool: ${toolName}` };
  }
  return { ok: true, tool };
}

function invokeFailure(result: InvokeResult): HeadlessToolCallFailure {
  const message = result.errorMsg ?? (result.stderr.trim() || `Exit code ${result.exitCode}`);
  return {
    ok: false,
    kind: result.kind === "help" ? "help" : "invoke",
    message,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    failureKind: result.failureKind,
    invokeResult: result,
  };
}

function noResponseFailure(result: InvokeResult): HeadlessToolCallFailure {
  return {
    ok: false,
    kind: "invoke",
    message: "Handler did not call ctx.respond() or return a value",
    exitCode: 1,
    stdout: result.stdout,
    stderr: result.stderr,
    failureKind: "unexpected",
    invokeResult: result,
  };
}

/** Pre-invoke argument failure (bad shape or argv conversion error). */
function argvFailure(
  /** Client-facing error message. */
  message: string,
): HeadlessToolCallFailure {
  return { ok: false, kind: "argv", message, exitCode: 1, stdout: "", stderr: "", failureKind: "validation" };
}

/**
 * Returns the leaf input from wrapped tool arguments (`{ input: {...} }`, plus any path parameters next to it),
 * or `undefined` when malformed. Path parameter values are merged into the returned object.
 */
function unwrapToolArgs(
  /** Raw tools/call arguments. */
  args: Record<string, unknown>,
  /** Path parameter names allowed next to `input`. */
  pathParamNames: string[],
): Record<string, unknown> | undefined {
  const inner = args[MCP_INPUT_WRAPPER_KEY];
  const allowed = new Set([MCP_INPUT_WRAPPER_KEY, ...pathParamNames]);
  const onlyAllowedKeys = Object.keys(args).every((key) => allowed.has(key));
  if (!onlyAllowedKeys || typeof inner !== "object" || inner === null || Array.isArray(inner)) {
    return undefined;
  }
  const merged: Record<string, unknown> = { ...(inner as Record<string, unknown>) };
  for (const name of pathParamNames) {
    if (name in args) merged[name] = args[name];
  }
  return merged;
}

/**
 * Converts flat tool arguments to argv and invokes the leaf handler headlessly.
 * Wrapped tools (see `wrapMcpRootSchema`) receive `{ input: {...} }`, unwrapped here, and return
 * `structuredContent` wrapped as `{ result: ... }` to match their `outputSchema`.
 */
export async function executeHeadlessToolCall(
  cli: App,
  tool: McpToolDef,
  args: Record<string, unknown>,
  invocation: Invocation,
  mcp?: { rpcMethod: string; toolName?: string; requestId: string },
): Promise<HeadlessToolCallResult> {
  const leafArgs = tool.inputWrapped ? unwrapToolArgs(args, tool.pathParamNames) : args;
  if (leafArgs === undefined) {
    return argvFailure(
      `Tool arguments must be an object with a single "${MCP_INPUT_WRAPPER_KEY}" object property (see inputSchema)`,
    );
  }

  const argvResult = mcpToolCallToArgv(cli.spec, tool, leafArgs);
  if ("error" in argvResult) {
    return argvFailure(argvResult.error);
  }

  const invokeResult = await cli.invoke(argvResult, { invocation, toolArgs: leafArgs, mcp });
  if (invokeResult.kind === "help") {
    return invokeFailure(invokeResult);
  }

  if (invokeResult.kind === "ok" && invokeResult.exitCode === 0 && invokeResult.response) {
    const mcpResult = buildToolCallSuccessFromResponse(invokeResult.response);
    return {
      ok: true,
      response: invokeResult.response,
      mcpResult: tool.outputWrapped
        ? { ...mcpResult, structuredContent: { [MCP_OUTPUT_WRAPPER_KEY]: mcpResult.structuredContent } }
        : mcpResult,
    };
  }

  if (invokeResult.kind === "ok" && invokeResult.exitCode === 0) {
    return noResponseFailure(invokeResult);
  }

  return invokeFailure(invokeResult);
}

/**
 * Invokes a matched HTTP REST route headlessly (query + body → argv → invoke).
 */
export async function executeHttpRouteCall(
  cli: App,
  route: HttpRouteDef,
  pathParams: Record<string, string>,
  query: Record<string, string>,
  body: Record<string, unknown>,
  http?: { request: Request; clientIp: string; requestId: string; traceId?: string; spanId?: string },
): Promise<HeadlessToolCallResult> {
  const argvResult = httpRequestToArgv(cli.spec, route, pathParams, query, body);
  if ("error" in argvResult) {
    return argvFailure(argvResult.error);
  }

  const toolArgs = { ...body, ...query, ...pathParams };
  const invokeResult = await cli.invoke(argvResult, { invocation: "http", toolArgs, http });
  if (invokeResult.kind === "help") {
    return invokeFailure(invokeResult);
  }

  if (invokeResult.kind === "ok" && invokeResult.exitCode === 0 && invokeResult.response) {
    const mcpResult = buildToolCallSuccessFromResponse(invokeResult.response);
    return {
      ok: true,
      response: invokeResult.response,
      mcpResult,
    };
  }

  if (invokeResult.kind === "ok" && invokeResult.exitCode === 0) {
    return noResponseFailure(invokeResult);
  }

  return invokeFailure(invokeResult);
}

/** Maps a headless success result to an HTTP Response. */
export function headlessSuccessToHttpResponse(
  result: HeadlessToolCallSuccess,
  leafApiResponse?: import("../core/types.ts").HttpResponseConfig,
  defaultStatus?: number,
): Response {
  return apiSuccessResponse(result.response, leafApiResponse, defaultStatus);
}

/** Maps a headless failure result to a JSON HTTP error Response. */
export function headlessFailureToHttpResponse(result: HeadlessToolCallFailure, obscureUnexpected = false): Response {
  const status = resolveHttpErrorStatus(result);
  return apiErrorResponse(status, { error: formatHeadlessError(result, obscureUnexpected) });
}

function resolveHttpErrorStatus(result: HeadlessToolCallFailure): number {
  if (result.failureKind) {
    return failureKindHttpStatus(result.failureKind);
  }
  if (result.kind === "argv" || result.kind === "help") {
    return 400;
  }
  if (result.kind === "invoke" && result.message.includes("ctx.respond()")) {
    return 500;
  }
  if (result.exitCode === 1) {
    return 400;
  }
  return 500;
}

/** Maps invoke failure kind to MCP tools/call error text (respects obscureUnexpected). */
export function headlessFailureMcpMessage(
  /** Failed headless tool invocation. */
  result: HeadlessToolCallFailure,
  /** When true, unexpected failures return a generic client message. */
  obscureUnexpected = false,
): string {
  return formatHeadlessError(result, obscureUnexpected);
}

/** Formats a headless failure for MCP text content and HTTP JSON `error` (full message, ANSI stripped). */
function formatHeadlessError(
  /** Failed headless tool invocation. */
  result: HeadlessToolCallFailure,
  /** When true, unexpected failures return a generic client message. */
  obscureUnexpected: boolean,
): string {
  if (obscureUnexpected && result.failureKind === "unexpected") {
    return obscureUnexpectedClientMessage();
  }
  return stripAnsi(result.message).trim();
}
