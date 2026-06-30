import { existsSync, readdirSync, rmdirSync } from "node:fs";

/** Removes a directory when it exists and is empty. Returns true when removed. */
export function removeEmptyDir(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    if (readdirSync(path).length > 0) return false;
    rmdirSync(path);
    return true;
  } catch {
    return false;
  }
}
