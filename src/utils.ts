/*
This module holds the low-level string and number helpers.
It contains the small parsing checks that are used in multiple places without pulling
in heavier logic from the parser or validation modules.

It keeps numeric checks consistent across the package.
*/

/** Returns whether s is a valid number with no extra characters. */
export function fullStringIsDouble(s: string): boolean {
  if (s.trim().length === 0) return false;
  const num = Number(s);
  if (Number.isNaN(num)) return false;
  // Ensure the string isn't just whitespace or contains trailing garbage
  // number literal check that works for scientific notation, hex, etc.
  return !Number.isNaN(parseFloat(s)) && Number.isFinite(num);
}

/** Parses a strict double from s, or returns null if the string is not a full numeric token. */
export function strictParseDouble(s: string): number | null {
  if (!fullStringIsDouble(s)) return null;
  const num = Number(s);
  return Number.isNaN(num) ? null : num;
}

/** True when stdin is a TTY. */
export const isInteractiveTty = !!process.stdin.isTTY;
