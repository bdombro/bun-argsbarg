/*
Framework log emitter: ECS json or human text to stderr with optional file tee.
*/

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CliProgram } from "~/core/types.ts";
import { type EcsLogEvent, type EcsLogLevel, formatEcsLine } from "./ecs.ts";

/** Resolved logging options for a server or invoke session. */
export interface ResolvedLogConfig {
  format: "json" | "text";
  file?: string;
  access: boolean;
  errors: boolean;
  dev: boolean;
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
    this.emit({
      level: "info",
      message: `${fields.method} ${fields.path}`,
      action: "http.access",
      labels: {
        ...(fields.requestId ? { request_id: fields.requestId } : {}),
        ...(fields.clientIp ? { client_ip: fields.clientIp } : {}),
        http_method: fields.method,
        http_path: fields.path,
        http_status: fields.status,
        duration_ms: fields.durationMs,
      },
    });
  }

  /** Error log after the hook pipeline (real stack always included). */
  emitInvokeError(
    failureKind: string,
    error: unknown,
    clientMessage: string,
    labels?: Record<string, string | number | boolean>,
  ): void {
    if (!this.resolved.errors) {
      return;
    }
    this.emit({
      level: failureKind === "unexpected" ? "error" : "warn",
      message: clientMessage,
      action: "invoke.error",
      labels: { failure_kind: failureKind, ...labels },
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
    return formatEcsLine(this.service, event);
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
