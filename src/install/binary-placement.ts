import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { CliProgram } from "../types.ts";

/** Resolves a command name on PATH to its real path, if present. */
export function resolvePathCommand(key: string): string | undefined {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, key);
    try {
      accessSync(candidate, constants.F_OK);
      return realpathSync(candidate);
    } catch {}
  }

  const found = Bun.which(key);
  if (found === null) return undefined;
  try {
    return realpathSync(found);
  } catch {
    return found;
  }
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** True when PATH resolves to the running executable (e.g. Homebrew Cellar). */
export function isExternallyManagedBinary(key: string, execPath: string = process.execPath): boolean {
  const resolved = resolvePathCommand(key);
  if (!resolved) return false;
  return resolved === realpathOrSelf(execPath);
}

/** True when the app binary is available on PATH (e.g. Homebrew). */
export function isAppInstalled(program: CliProgram): boolean {
  return isExternallyManagedBinary(program.key);
}
