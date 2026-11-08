/*
Zero-dependency error reporter for Sentry-compatible collectors (Sentry, Bugsink, GlitchTip).
Apps create one with their DSN and pass it as `errorReporter` on the app spec; the runtime then
reports unexpected command failures on CLI, HTTP and MCP. Apps can also report silent failures
themselves. Each reporter holds its own DSN (no global state), so several apps can share a process.
*/

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

/** Severity of a reported event. */
export type ErrorReportLevel = "error" | "warning" | "info";

/** Sends errors and messages to a Sentry-compatible collector. Reporting never throws. */
export interface ErrorReporter {
  /** Reports an exception with optional extra context. */
  reportError(
    /** The error (non-Errors are stringified). */
    error: unknown,
    /** Extra context shown with the event. */
    extra?: Record<string, unknown>,
  ): Promise<void>;
  /** Reports a message, e.g. a silent failure. Events group by message, so keep variable parts in `extra`. */
  reportMessage(
    /** Message text. */
    message: string,
    /** Severity (default: warning). */
    level?: ErrorReportLevel,
    /** Extra context shown with the event. */
    extra?: Record<string, unknown>,
  ): Promise<void>;
}

/** Options for {@link createErrorReporter}. */
export interface ErrorReporterOptions {
  /** DSN like `https://key@host/projectId`; an empty string disables reporting. */
  dsn: string;
  /** Env var that overrides `dsn` when set (an empty value disables reporting, e.g. in tests). */
  env?: string;
}

/** Maximum wait for the collector before giving up on one event. */
const SEND_TIMEOUT_MS = 10_000;

/** Creates a reporter for one DSN; the env override is read at send time. */
export function createErrorReporter(
  /** DSN and optional env override. */
  opts: ErrorReporterOptions,
): ErrorReporter {
  /** Posts one event to the collector; failures are swallowed. */
  async function send(event: Record<string, unknown>): Promise<void> {
    const override = opts.env ? process.env[opts.env] : undefined;
    const url = sentryEnvelopeUrl(override ?? opts.dsn);
    if (!url) return;
    const eventId = randomUUID().replaceAll("-", "");
    const timestamp = new Date().toISOString();
    const payload = {
      event_id: eventId,
      timestamp,
      platform: "node",
      server_name: hostname(),
      environment: process.env.NODE_ENV ?? "production",
      ...event,
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: timestamp }),
      JSON.stringify({ type: "event", content_type: "application/json" }),
      JSON.stringify(payload),
    ].join("\n");
    try {
      await fetch(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch {
      // Reporting must never fail the caller.
    }
  }

  return {
    async reportError(error, extra = {}) {
      const err = error instanceof Error ? error : new Error(String(error));
      await send({
        level: "error",
        exception: {
          values: [
            {
              type: err.name || "Error",
              value: err.message,
              ...(err.stack ? { stacktrace: { frames: parseStackFrames(err.stack) } } : {}),
            },
          ],
        },
        extra,
      });
    },
    async reportMessage(message, level = "warning", extra = {}) {
      await send({ level, message: { formatted: message }, extra });
    },
  };
}

/** Envelope endpoint for a DSN, or undefined when the DSN is empty. */
export function sentryEnvelopeUrl(
  /** DSN like `https://key@host/projectId`. */
  dsn: string,
): string | undefined {
  if (!dsn) return undefined;
  const url = new URL(dsn);
  const project = url.pathname.replace(/^\//, "");
  return `${url.protocol}//${url.host}/api/${project}/envelope/?sentry_key=${url.username}&sentry_version=7`;
}

/** Converts V8 stack lines to Sentry frames, oldest first. */
export function parseStackFrames(
  /** `error.stack`. */
  stack: string,
): { function: string; filename: string; lineno?: number; colno?: number }[] {
  const frames: { function: string; filename: string; lineno?: number; colno?: number }[] = [];
  for (const raw of stack.split("\n")) {
    const line = raw.trim();
    const withFn = line.match(/^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
    const bare = line.match(/^at\s+(.+?):(\d+):(\d+)$/);
    if (withFn) {
      frames.push({
        function: withFn[1] as string,
        filename: withFn[2] as string,
        lineno: Number(withFn[3]),
        colno: Number(withFn[4]),
      });
    } else if (bare) {
      frames.push({ function: "?", filename: bare[1] as string, lineno: Number(bare[2]), colno: Number(bare[3]) });
    }
  }
  return frames.reverse();
}
