/*
Shared headless tool dispatch for MCP and HTTP: config bootstrap, argv conversion, and invoke.
*/

import { apiErrorResponse, apiSuccessResponse } from "../api/result.ts";
import type { Cli, CliInvokeResult } from "../cli.ts";
import { bootstrapAppConfig } from "../config/bootstrap.ts";
import { formatMcpMissingConfigMessage, missingRequiredConfig } from "../config/resolve.ts";
import { buildToolCallSuccessFromResponse } from "../mcp/result.ts";
import { collectMcpTools, type McpToolDef, mcpToolCallToArgv } from "../mcp/tools.ts";
import type { CliInvocation, CliProgram } from "../types.ts";

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
  invokeResult?: CliInvokeResult;
}

export type HeadlessToolCallResult = HeadlessToolCallSuccess | HeadlessToolCallFailure;

/** Finds an exposed tool by MCP or HTTP API tool name. */
export function lookupHeadlessTool(
  program: CliProgram,
  toolName: string,
  invocation: CliInvocation = "mcp",
): ToolLookupResult {
  const tools = collectMcpTools(program);
  const tool =
    invocation === "api" ? tools.find((t) => t.apiName === toolName) : tools.find((t) => t.name === toolName);
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

/**
 * Converts flat tool arguments to argv and invokes the leaf handler headlessly.
 */
export async function executeHeadlessToolCall(
  cli: Cli,
  tool: McpToolDef,
  args: Record<string, unknown>,
  invocation: CliInvocation,
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
    };
  }

  const invokeResult = await cli.invoke(argvResult, { invocation, toolArgs: args });
  if (invokeResult.kind === "help") {
    return {
      ok: false,
      kind: "help",
      message: invokeResult.errorMsg ?? "Help is not available via tool calls.",
      exitCode: invokeResult.exitCode,
      stdout: invokeResult.stdout,
      stderr: invokeResult.stderr,
      invokeResult,
    };
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
    return {
      ok: false,
      kind: "invoke",
      message: "Handler did not call ctx.respond() or return a value",
      exitCode: 1,
      stdout: invokeResult.stdout,
      stderr: invokeResult.stderr,
      invokeResult,
    };
  }

  const message = invokeResult.errorMsg ?? (invokeResult.stderr.trim() || `Exit code ${invokeResult.exitCode}`);
  return {
    ok: false,
    kind: "invoke",
    message,
    exitCode: invokeResult.exitCode,
    stdout: invokeResult.stdout,
    stderr: invokeResult.stderr,
    invokeResult,
  };
}

/** Maps a headless success result to an HTTP Response. */
export function headlessSuccessToHttpResponse(
  result: HeadlessToolCallSuccess,
  leafApiResponse?: import("../types.ts").CliApiResponseConfig,
): Response {
  return apiSuccessResponse(result.response, leafApiResponse);
}

/** Maps a headless failure result to a JSON HTTP error Response. */
export function headlessFailureToHttpResponse(result: HeadlessToolCallFailure): Response {
  const status = result.kind === "argv" || result.kind === "help" ? 400 : 500;
  return apiErrorResponse(status, {
    error: result.message,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}
