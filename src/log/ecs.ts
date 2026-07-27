/*
Elastic Common Schema (ECS) JSON log line formatting for framework observability.
*/

/** ECS version string written to every JSON log line. */
export const ECS_VERSION = "8.11.0";

/** Severity label for ECS `log.level`. */
export type EcsLogLevel = "debug" | "info" | "warn" | "error";

/** Fields merged into every ECS log line. */
export interface EcsServiceFields {
  name: string;
  version: string;
}

/** Context for {@link CliLogConfig.enrich} and {@link CliLogConfig.serialize}. */
export interface LogEnrichContext {
  level: EcsLogLevel;
  message: string;
  action?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  labels?: Record<string, string | number | boolean>;
  error?: unknown;
  service: EcsServiceFields;
  http?: {
    method: string;
    path: string;
    status: number;
    durationMs: number;
    clientIp?: string;
  };
}

/** Input for one ECS log event. */
export interface EcsLogEvent {
  level: EcsLogLevel;
  message: string;
  action?: string;
  labels?: Record<string, string | number | boolean>;
  error?: unknown;
  fields?: Record<string, unknown>;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  /** Populated on HTTP/MCP access log events for {@link CliLogConfig.enrich}. */
  http?: LogEnrichContext["http"];
}

/** Options for {@link formatEcsLine}. */
export interface FormatEcsLineOpts {
  service: EcsServiceFields;
  event: EcsLogEvent;
  /** Additive fields merged after the ECS baseline (cannot override protected keys). */
  enrich?: (ctx: LogEnrichContext) => Record<string, unknown>;
}

/** ECS baseline keys that {@link FormatEcsLineOpts.enrich} must not override. */
export const PROTECTED_ECS_KEYS = new Set([
  "@timestamp",
  "log.level",
  "message",
  "ecs.version",
  "service.name",
  "service.version",
]);

function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      "error.message": error.message,
      "error.type": error.name,
      ...(error.stack ? { "error.stack_trace": error.stack } : {}),
    };
  }
  return { "error.message": String(error) };
}

function buildEnrichContext(service: EcsServiceFields, event: EcsLogEvent): LogEnrichContext {
  return {
    level: event.level,
    message: event.message,
    action: event.action,
    requestId: event.requestId,
    traceId: event.traceId,
    spanId: event.spanId,
    labels: event.labels,
    error: event.error,
    service,
    http: event.http,
  };
}

/** Merges enrich output without overriding protected or existing ECS baseline keys. */
export function mergeEnrichFields(line: Record<string, unknown>, enrich: Record<string, unknown> | undefined): void {
  if (!enrich) {
    return;
  }
  for (const [key, value] of Object.entries(enrich)) {
    if (PROTECTED_ECS_KEYS.has(key) || key in line) {
      continue;
    }
    line[key] = value;
  }
}

/** Formats one ECS Logging–compatible JSON log line (newline omitted). */
export function formatEcsLine(opts: FormatEcsLineOpts): string;
/** @deprecated Pass {@link FormatEcsLineOpts} instead. */
export function formatEcsLine(service: EcsServiceFields, event: EcsLogEvent): string;
export function formatEcsLine(serviceOrOpts: EcsServiceFields | FormatEcsLineOpts, event?: EcsLogEvent): string {
  const opts: FormatEcsLineOpts =
    event !== undefined ? { service: serviceOrOpts as EcsServiceFields, event } : (serviceOrOpts as FormatEcsLineOpts);
  const { service, event: ev } = opts;

  const line: Record<string, unknown> = {
    "@timestamp": new Date().toISOString(),
    "log.level": ev.level,
    message: ev.message,
    "ecs.version": ECS_VERSION,
    "service.name": service.name,
    "service.version": service.version,
  };

  if (ev.action) {
    line["event.action"] = ev.action;
  }
  if (ev.traceId) {
    line["trace.id"] = ev.traceId;
  }
  if (ev.spanId) {
    line["span.id"] = ev.spanId;
  }
  if (ev.labels && Object.keys(ev.labels).length > 0) {
    line.labels = { ...ev.labels };
  }
  if (ev.fields) {
    Object.assign(line, ev.fields);
  }
  if (ev.error !== undefined) {
    Object.assign(line, errorFields(ev.error));
  }

  mergeEnrichFields(line, opts.enrich?.(buildEnrichContext(service, ev)));

  return JSON.stringify(line);
}

/** Converts HTTP access duration from milliseconds to ECS `event.duration` nanoseconds. */
export function durationMsToEcsNanos(durationMs: number): number {
  return durationMs * 1_000_000;
}
