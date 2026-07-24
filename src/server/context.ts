/*
Per-server mutable handle context passed through HTTP/MCP dispatch.
*/

import type { CliHttpWireHooks, CliMcpWireHooks, ServerRuntime, ServerState } from "../core/types.ts";
import type { LogEmitter } from "../log/emitter.ts";
import type { ResolvedHttpServeConfig, ResolvedMcpServeConfig } from "./overrides.ts";

/** Shared server state for one HTTP or MCP serve session. */
export interface ServerHandleContext {
  runtime: ServerRuntime;
  emitter: LogEmitter;
  http?: ResolvedHttpServeConfig;
  mcp?: ResolvedMcpServeConfig;
  httpHooks?: CliHttpWireHooks;
  mcpHooks?: CliMcpWireHooks;
}

/** Creates a fresh {@link ServerRuntime} for HTTP or MCP. */
export function createServerRuntime(
  program: import("../core/types.ts").CliProgram,
  surface: "http" | "mcp",
): ServerRuntime {
  return { state: {} as ServerState, program, surface };
}
