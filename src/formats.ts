/*
Named string format validation and parsing for CLI options.
*/

import { CliValueFormat } from "./types.ts";

const DURATION_RE = /^\d+[hdms]?$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a duration string (e.g. 20m, 1h, 30s) into milliseconds. */
export function parseDurationMs(durationStr: string): number {
  const match = durationStr.trim().match(/^(\d+)([hdms]?)$/i);
  if (!match) {
    throw new Error("Invalid duration format. Use e.g. 30s, 20m, 1h, 2d");
  }
  const amountText = match[1];
  if (!amountText) {
    throw new Error("Invalid duration format. Use e.g. 30s, 20m, 1h, 2d");
  }
  const amount = Number.parseInt(amountText, 10);
  const unit = (match[2] || "m").toLowerCase();
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  if (unit === "d") return amount * 24 * 60 * 60 * 1000;
  return amount * 60 * 1000;
}

export function validateDuration(s: string): void {
  if (!DURATION_RE.test(s.trim())) {
    throw new Error("Invalid duration format. Use e.g. 30s, 20m, 1h, 2d");
  }
  parseDurationMs(s);
}

/** Splits a comma-separated string into trimmed non-empty tokens. */
export function parseCommaList(s: string): string[] {
  return s
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function validateCommaList(s: string): void {
  if (parseCommaList(s).length === 0) {
    throw new Error("Comma-separated list must contain at least one value");
  }
}

/** Returns canonical YYYY-MM-DD after validation. */
export function parseDate(s: string): string {
  const trimmed = s.trim();
  if (!DATE_RE.test(trimmed)) {
    throw new Error("Invalid date. Use YYYY-MM-DD");
  }
  const [y, m, d] = trimmed.split("-").map((part) => Number.parseInt(part, 10));
  const year = y ?? 0;
  const month = m ?? 0;
  const day = d ?? 0;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    throw new Error("Invalid date. Use YYYY-MM-DD");
  }
  return trimmed;
}

export function validateDate(s: string): void {
  parseDate(s);
}

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Returns normalized ISO 8601 UTC after validation. */
export function parseDateTime(s: string): string {
  const trimmed = s.trim();
  if (!DATE_TIME_RE.test(trimmed)) {
    throw new Error("Invalid date-time. Use RFC 3339, e.g. 2026-06-22T15:00:00Z");
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new Error("Invalid date-time. Use RFC 3339, e.g. 2026-06-22T15:00:00Z");
  }
  return new Date(ms).toISOString();
}

export function validateDateTime(s: string): void {
  parseDateTime(s);
}

export function validatePattern(s: string, pattern: string): void {
  const re = new RegExp(pattern);
  if (!re.test(s)) {
    throw new Error(`Value does not match required pattern: ${pattern}`);
  }
}

export function formatValidationError(format: CliValueFormat, value: string): string {
  switch (format) {
    case CliValueFormat.Duration:
      return `Invalid duration: ${value} (use e.g. 30s, 20m, 1h, 2d)`;
    case CliValueFormat.CommaList:
      return `Invalid comma-separated list: ${value}`;
    case CliValueFormat.Date:
      return `Invalid date: ${value} (use YYYY-MM-DD)`;
    case CliValueFormat.DateTime:
      return `Invalid date-time: ${value} (use RFC 3339, e.g. 2026-06-22T15:00:00Z)`;
  }
}

/** Validates a string value against format and/or pattern metadata. */
export function validateFormatValue(
  value: string,
  format?: CliValueFormat,
  pattern?: string,
): void {
  if (format !== undefined) {
    switch (format) {
      case CliValueFormat.Duration:
        validateDuration(value);
        return;
      case CliValueFormat.CommaList:
        validateCommaList(value);
        return;
      case CliValueFormat.Date:
        validateDate(value);
        return;
      case CliValueFormat.DateTime:
        validateDateTime(value);
        return;
    }
  }
  if (pattern !== undefined) {
    validatePattern(value, pattern);
  }
}
