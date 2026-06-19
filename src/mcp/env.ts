/*
This module bootstraps process.env for MCP servers from login shell and .env files.
*/

import { readFileSync } from "node:fs";
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

/** Loads a .env file into process.env (always overwrites). Warns on stderr if missing. */
export function loadEnvFile(envFile: string): void {
  const resolved = envFile.startsWith("~")
    ? envFile.replace("~", process.env.HOME ?? "")
    : envFile;
  let text: string;
  try {
    text = readFileSync(resolved, "utf8");
  } catch {
    process.stderr.write(`[argsbarg] envFile not found: ${envFile}\n`);
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) {
      process.env[key] = val;
    }
  }
}

/** Applies mcpServer shellEnv and envFile bootstrap in order. */
export function bootstrapMcpEnv(config: {
  shellEnv?: boolean | string;
  envFile?: string;
}): void {
  const shellEnvCfg = config.shellEnv;
  if (shellEnvCfg) {
    const shell =
      typeof shellEnvCfg === "string"
        ? shellEnvCfg
        : (process.env.SHELL ?? (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"));
    const captured = captureShellEnv(shell);
    if (Object.keys(captured).length === 0) {
      process.stderr.write(`[argsbarg] shellEnv: failed to capture shell environment from ${shell}\n`);
    } else {
      applyShellEnv(captured);
    }
  }
  if (config.envFile) {
    loadEnvFile(config.envFile);
  }
}
