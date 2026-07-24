/*
Shared headless tool dispatch for MCP and HTTP: config bootstrap, argv conversion, and invoke.
*/

import { bootstrapAppConfig } from "../config/bootstrap.ts";
import { formatMcpMissingConfigMessage, missingRequiredConfig } from "../config/resolve.ts";
import type { CliInvocation, CliProgram, InvokeFailureKind } from "../core/types.ts";
import { failureKindHttpStatus } from "../hooks/run.ts";
import { apiErrorResponse, apiSuccessResponse, firstErrorLine } from "../http/result.ts";
import { type HttpRouteDef, httpRequestToArgv } from "../http/routes.ts";
import { obscureUnexpectedClientMessage } from "../log/emitter.ts";
import { buildToolCallSuccessFromResponse } from "../mcp/result.ts";
import { collectMcpTools, type McpToolDef, mcpToolCallToArgv } from "../mcp/tools.ts";
import type { Cli, CliInvokeResult } from "../runtime/cli.ts";

/** Outcome of resolving a tool name against the program schema. */
export type ToolLookupResult =
  | { ok: true; tool: McpToolDef }
  | { ok: false; kind: "unknown"; message: string }
  | { ok: false; kind: "missing_config"; message: string };

/** Successful headless tool invocation payload shared by MCP and HTTP. */
export interface HeadlessToolCallSuccess {
  ok: true;
  response: NonNullable<CliInvokeResult["response"]>;
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
  invokeResult?: CliInvokeResult;
}

export type HeadlessToolCallResult = HeadlessToolCallSuccess | HeadlessToolCallFailure;

/** Finds an exposed MCP tool by name. */
export function lookupHeadlessTool(program: CliProgram, toolName: string): ToolLookupResult {
  const tools = collectMcpTools(program);
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return { ok: false, kind: "unknown", message: `Unknown tool: ${toolName}` };
  }
  const { resolved } = bootstrapAppConfig(program, { validateFile: false });
  const missingConfig = missingRequiredConfig(program, resolved);
  if (missingConfig.length > 0) {
    return {
      ok: false,
      kind: "missing_config",
      message: formatMcpMissingConfigMessage(program, missingConfig),
    };
  }
  return { ok: true, tool };
}

function invokeFailure(result: CliInvokeResult): HeadlessToolCallFailure {
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

function noResponseFailure(result: CliInvokeResult): HeadlessToolCallFailure {
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

/**
 * Converts flat tool arguments to argv and invokes the leaf handler headlessly.
 */
export async function executeHeadlessToolCall(
  cli: Cli,
  tool: McpToolDef,
  args: Record<string, unknown>,
  invocation: CliInvocation,
  mcp?: { rpcMethod: string; toolName?: string; requestId: string },
): Promise<HeadlessToolCallResult> {
  const argvResult = mcpToolCallToArgv(cli.program, tool, args);
  if ("error" in argvResult) {
    return {
      ok: false,
      kind: "argv",
      message: argvResult.error,
      exitCode: 1,
      stdout: "",
      stderr: "",
      failureKind: "validation",
    };
  }

  const invokeResult = await cli.invoke(argvResult, { invocation, toolArgs: args, mcp });
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

/**
 * Invokes a matched HTTP REST route headlessly (query + body → argv → invoke).
 */
export async function executeHttpRouteCall(
  cli: Cli,
  route: HttpRouteDef,
  pathParams: Record<string, string>,
  query: Record<string, string>,
  body: Record<string, unknown>,
  http?: { request: Request; clientIp: string; requestId: string },
): Promise<HeadlessToolCallResult> {
  const argvResult = httpRequestToArgv(cli.program, route, pathParams, query, body);
  if ("error" in argvResult) {
    return {
      ok: false,
      kind: "argv",
      message: argvResult.error,
      exitCode: 1,
      stdout: "",
      stderr: "",
      failureKind: "validation",
    };
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
  leafApiResponse?: import("../core/types.ts").CliHttpResponseConfig,
  defaultStatus?: number,
): Response {
  return apiSuccessResponse(result.response, leafApiResponse, defaultStatus);
}

/** Maps a headless failure result to a JSON HTTP error Response. */
export function headlessFailureToHttpResponse(result: HeadlessToolCallFailure, obscureUnexpected = false): Response {
  const status = resolveHttpErrorStatus(result);
  let message = firstErrorLine(result.message);
  if (obscureUnexpected && result.failureKind === "unexpected") {
    message = obscureUnexpectedClientMessage();
  }
  return apiErrorResponse(status, { error: message });
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
export function headlessFailureMcpMessage(result: HeadlessToolCallFailure, obscureUnexpected = false): string {
  if (obscureUnexpected && result.failureKind === "unexpected") {
    return obscureUnexpectedClientMessage();
  }
  return firstErrorLine(result.message);
}

/** Missing-config lookup failures as MCP/HTTP pre-invoke errors. */
export function missingConfigFailureKind(): InvokeFailureKind {
  return "missing_config";
}
