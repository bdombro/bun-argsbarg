/*
Elastic Common Schema (ECS) JSON log line formatting for framework observability.
*/

/** Severity label for ECS `log.level`. */
export type EcsLogLevel = "debug" | "info" | "warn" | "error";

/** Fields merged into every ECS log line. */
export interface EcsServiceFields {
  name: string;
  version: string;
}

/** Input for one ECS log event. */
export interface EcsLogEvent {
  level: EcsLogLevel;
  message: string;
  action?: string;
  labels?: Record<string, string | number | boolean>;
  error?: unknown;
  fields?: Record<string, unknown>;
}

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

/** Formats one ECS-compatible JSON log line (newline omitted). */
export function formatEcsLine(service: EcsServiceFields, event: EcsLogEvent): string {
  const line: Record<string, unknown> = {
    "@timestamp": new Date().toISOString(),
    "log.level": event.level,
    message: event.message,
    "service.name": service.name,
    "service.version": service.version,
  };
  if (event.action) {
    line["event.action"] = event.action;
  }
  if (event.labels) {
    for (const [key, value] of Object.entries(event.labels)) {
      line[`labels.${key}`] = value;
    }
  }
  if (event.fields) {
    Object.assign(line, event.fields);
  }
  if (event.error !== undefined) {
    Object.assign(line, errorFields(event.error));
  }
  return JSON.stringify(line);
}
