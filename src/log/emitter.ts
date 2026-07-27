/*
Framework log emitter: ECS json or human text to stderr with optional file tee.
*/

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CliLogConfig, CliProgram } from "../core/types.ts";
import type { LogEnrichContext } from "./ecs.ts";
import { durationMsToEcsNanos, type EcsLogEvent, type EcsLogLevel, formatEcsLine } from "./ecs.ts";

/** Resolved logging options for a server or invoke session. */
export interface ResolvedLogConfig {
  format: "json" | "text";
  file?: string;
  access: boolean;
  errors: boolean;
  dev: boolean;
  enrich?: CliLogConfig["enrich"];
  serialize?: CliLogConfig["serialize"];
}

/** Options for {@link LogEmitter}. */
export interface LogEmitterOpts {
  program: CliProgram;
  resolved: ResolvedLogConfig;
}

const OBSCURE_CLIENT_MESSAGE = "An unexpected error occurred.";

/** Fixed client message when `obscureUnexpected` hides internal failures. */
export function obscureUnexpectedClientMessage(): string {
  return OBSCURE_CLIENT_MESSAGE;
}

/** Merges program defaults with CLI flag / serve overrides. */
export function resolveLogConfig(program: CliProgram, overrides: Partial<ResolvedLogConfig> = {}): ResolvedLogConfig {
  const log = program.log;
  return {
    format: overrides.format ?? log?.format ?? "json",
    file: overrides.file ?? log?.file,
    access: overrides.access ?? log?.access ?? true,
    errors: overrides.errors ?? log?.errors ?? true,
    dev: overrides.dev ?? false,
    enrich: log?.enrich,
    serialize: log?.serialize,
  };
}

/** Tee framework logs to stderr and an optional append-only file. */
export class LogEmitter {
  private readonly service: { name: string; version: string };
  private readonly resolved: ResolvedLogConfig;

  constructor(opts: LogEmitterOpts) {
    this.service = { name: opts.program.key, version: opts.program.version };
    this.resolved = opts.resolved;
  }

  get config(): ResolvedLogConfig {
    return this.resolved;
  }

  /** Emits one log event to stderr (and optional file). */
  emit(event: EcsLogEvent): void {
    const line = this.formatLine(event);
    process.stderr.write(`${line}\n`);
    this.appendFile(line);
  }

  /** Human startup line or ECS/json event for lifecycle milestones. */
  emitLifecycle(message: string, action: string, labels?: Record<string, string | number | boolean>): void {
    if (this.resolved.format === "text") {
      process.stderr.write(`${message}\n`);
      this.appendFile(message);
      return;
    }
    this.emit({ level: "info", message, action, labels });
  }

  /** Access log for one HTTP request or MCP RPC. */
  emitAccess(fields: {
    method: string;
    path: string;
    status: number;
    durationMs: number;
    requestId?: string;
    clientIp?: string;
    traceId?: string;
    spanId?: string;
  }): void {
    if (!this.resolved.access) {
      return;
    }
    if (this.resolved.format === "text") {
      const rid = fields.requestId ? ` ${fields.requestId}` : "";
      const line = `${fields.method} ${fields.path} ${fields.status} ${fields.durationMs}ms${rid}`;
      process.stderr.write(`${line}\n`);
      this.appendFile(line);
      return;
    }

    const isHttp = fields.method !== "MCP";
    const action = isHttp ? "http.access" : "mcp.access";
    const httpFields: Record<string, unknown> = isHttp
      ? {
          "http.request.method": fields.method,
          "url.path": fields.path,
          "http.response.status_code": fields.status,
          "event.duration": durationMsToEcsNanos(fields.durationMs),
        }
      : {
          "event.duration": durationMsToEcsNanos(fields.durationMs),
        };

    if (fields.clientIp && fields.clientIp !== "unknown") {
      httpFields["client.ip"] = fields.clientIp;
    }

    this.emit({
      level: "info",
      message: `${fields.method} ${fields.path}`,
      action,
      requestId: fields.requestId,
      traceId: fields.traceId,
      spanId: fields.spanId,
      fields: httpFields,
      labels: {
        ...(fields.requestId ? { request_id: fields.requestId } : {}),
        ...(isHttp ? {} : { rpc_method: fields.path }),
      },
      http: {
        method: fields.method,
        path: fields.path,
        status: fields.status,
        durationMs: fields.durationMs,
        clientIp: fields.clientIp,
      },
    });
  }

  /** Error log after the hook pipeline (real stack always included). */
  emitInvokeError(
    failureKind: string,
    error: unknown,
    clientMessage: string,
    meta?: {
      labels?: Record<string, string | number | boolean>;
      requestId?: string;
      traceId?: string;
      spanId?: string;
    },
  ): void {
    if (!this.resolved.errors) {
      return;
    }
    this.emit({
      level: failureKind === "unexpected" ? "error" : "warn",
      message: clientMessage,
      action: "invoke.error",
      labels: { failure_kind: failureKind, ...meta?.labels },
      requestId: meta?.requestId,
      traceId: meta?.traceId,
      spanId: meta?.spanId,
      error,
    });
    if (this.resolved.dev && error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}\n`);
      this.appendFile(error.stack);
    }
  }

  private formatLine(event: EcsLogEvent): string {
    if (this.resolved.format === "text") {
      return this.formatTextLine(event);
    }
    const enrichCtx = this.buildEnrichContext(event);
    if (this.resolved.serialize) {
      return this.resolved.serialize(enrichCtx);
    }
    return formatEcsLine({
      service: this.service,
      event,
      enrich: this.resolved.enrich,
    });
  }

  private buildEnrichContext(event: EcsLogEvent): LogEnrichContext {
    return {
      level: event.level,
      message: event.message,
      action: event.action,
      requestId: event.requestId,
      traceId: event.traceId,
      spanId: event.spanId,
      labels: event.labels,
      error: event.error,
      service: this.service,
      http: event.http,
    };
  }

  private formatTextLine(event: EcsLogEvent): string {
    const level = event.level.toUpperCase();
    const action = event.action ? ` [${event.action}]` : "";
    let line = `${level}${action}: ${event.message}`;
    if (event.error instanceof Error && event.error.stack) {
      line = `${line}\n${event.error.stack}`;
    }
    return line;
  }

  private appendFile(line: string): void {
    const file = this.resolved.file;
    if (!file) {
      return;
    }
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${line}\n`, "utf8");
    } catch {
      // Best-effort file tee; stderr already has the line.
    }
  }
}

/** Maps ECS level strings for quick call sites. */
export function ecsLevel(level: EcsLogLevel): EcsLogLevel {
  return level;
}
