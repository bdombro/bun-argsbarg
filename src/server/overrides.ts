/*
CLI flag and programmatic overrides merged into HTTP/MCP server runtime config.
*/

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AppSpec } from "../core/types.ts";
import { type ResolvedLogConfig, resolveLogConfig } from "../log/emitter.ts";

/** Overrides from `myapp http` / `serveHttp()` flags and embedders. */
export interface ServeOverrides {
  host?: string;
  port?: number;
  trustProxy?: boolean;
  obscureErrors?: boolean;
  logFormat?: "json" | "text";
  logFile?: string;
  noAccessLog?: boolean;
  dev?: boolean;
}

/** Resolved HTTP listen and error options after merging schema + overrides. */
export interface ResolvedHttpServeConfig {
  hostname: string;
  port: number;
  trustProxy: boolean;
  obscureUnexpected: boolean;
  log: ResolvedLogConfig;
}

/** Resolved MCP serve options after merging schema + overrides. */
export interface ResolvedMcpServeConfig {
  obscureUnexpected: boolean;
  log: ResolvedLogConfig;
}

function resolveLogFile(logFile: string | undefined): string | undefined {
  if (!logFile) {
    return undefined;
  }
  if (logFile === "~" || logFile.startsWith("~/")) {
    return join(homedir(), logFile.slice(1));
  }
  return resolve(logFile);
}

/** Builds resolved HTTP server config (CLI flags > program schema). */
export function resolveHttpServeConfig(program: AppSpec, overrides: ServeOverrides = {}): ResolvedHttpServeConfig {
  const http = program.httpServer;
  const obscureUnexpected = overrides.obscureErrors ?? http?.errors?.obscureUnexpected ?? false;
  return {
    hostname: overrides.host ?? http?.host ?? "127.0.0.1",
    port: overrides.port ?? http?.port ?? 3000,
    trustProxy: overrides.trustProxy ?? http?.trustProxy ?? false,
    obscureUnexpected,
    log: resolveLogConfig(program, {
      format: overrides.logFormat,
      file: resolveLogFile(overrides.logFile ?? program.log?.file),
      access: overrides.noAccessLog ? false : undefined,
      dev: overrides.dev,
    }),
  };
}

/** Builds resolved MCP server config (CLI flags > program schema). */
export function resolveMcpServeConfig(program: AppSpec, overrides: ServeOverrides = {}): ResolvedMcpServeConfig {
  const mcp = program.mcpServer;
  return {
    obscureUnexpected: overrides.obscureErrors ?? mcp?.errors?.obscureUnexpected ?? false,
    log: resolveLogConfig(program, {
      format: overrides.logFormat,
      file: resolveLogFile(overrides.logFile ?? program.log?.file),
      dev: overrides.dev,
    }),
  };
}

/** Parses `http` / `mcp serve` CLI opts into {@link ServeOverrides}. */
export function serveOverridesFromOpts(opts: Record<string, string>, surface: "http" | "mcp"): ServeOverrides {
  const out: ServeOverrides = {};
  if (opts.host) {
    out.host = opts.host;
  }
  if (opts.port) {
    const port = Number(opts.port);
    if (!Number.isNaN(port)) {
      out.port = port;
    }
  }
  if (opts["trust-proxy"]) {
    out.trustProxy = true;
  }
  if (opts["obscure-errors"]) {
    out.obscureErrors = true;
  }
  if (opts["log-format"] === "json" || opts["log-format"] === "text") {
    out.logFormat = opts["log-format"];
  }
  if (opts["log-file"]) {
    out.logFile = opts["log-file"];
  }
  if (opts["no-access-log"] && surface === "http") {
    out.noAccessLog = true;
  }
  if (opts.dev) {
    out.dev = true;
  }
  return out;
}
