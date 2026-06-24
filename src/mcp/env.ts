/*
This module bootstraps process.env for MCP servers from login shell.
*/

import { spawnSync } from "node:child_process";

/** Parses `env` stdout from a login shell into a key/value map. */
export function captureShellEnv(shell: string): Record<string, string> {
  const result = spawnSync(shell, ["-l", "-c", "env"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.error || result.status !== 0) {
    return {};
  }
  const env: Record<string, string> = {};
  for (const line of result.stdout.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      env[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return env;
}

/** Merges captured shell env into process.env (PATH merged; host wins for other keys). */
export function applyShellEnv(env: Record<string, string>): void {
  for (const [key, val] of Object.entries(env)) {
    if (key === "PATH") {
      const existing = process.env.PATH ?? "";
      const existingParts = new Set(existing.split(":"));
      const shellOnly = val.split(":").filter((p) => p.length > 0 && !existingParts.has(p));
      if (shellOnly.length > 0) {
        process.env.PATH = [...shellOnly, existing].join(":");
      }
    } else if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

/** Applies mcpServer shellEnv bootstrap. */
export function bootstrapMcpEnv(config: { shellEnv?: boolean | string }): void {
  const shellEnvCfg = config.shellEnv;
  if (shellEnvCfg) {
    const shell =
      typeof shellEnvCfg === "string"
        ? shellEnvCfg
        : (process.env.SHELL ?? (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"));
    const captured = captureShellEnv(shell);
    if (Object.keys(captured).length === 0) {
      process.stderr.write(
        `[argsbarg] shellEnv: failed to capture shell environment from ${shell}\n`,
      );
    } else {
      applyShellEnv(captured);
    }
  }
}
