/*
Detects built-in command paths so invoke hooks are skipped for framework commands.
*/

const BUILTIN_ROOTS = new Set(["completion", "version", "http", "mcp", "configure", "docs"]);

/** True when `path` routes to a framework built-in (hooks are skipped). */
export function isBuiltinInvokePath(path: string[]): boolean {
  const root = path[0];
  if (!root || !BUILTIN_ROOTS.has(root)) {
    return false;
  }
  if (root === "http") {
    return path.length <= 1 || path[1] === "serve";
  }
  if (root === "mcp") {
    return path.length <= 1 || path[1] === "serve" || path[1] === "bundle";
  }
  return true;
}
