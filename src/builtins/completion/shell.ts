/** Produces a shell-safe identifier from the app or command name (alnum → `_`). */
export function identToken(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

/** Escapes a string for use inside single quotes in generated shell scripts. */
export function escShellSingleQuoted(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/** Escapes a string for use inside fish single-quoted strings. */
export function escFishSingleQuoted(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Sanitizes the app key for generated shell function names (non-alnum removed). */
export function mainName(schemaName: string): string {
  return schemaName.replace(/[^a-zA-Z0-9]/g, "_");
}

export const kHelpLong = "--help";
export const kHelpShort = "-h";
