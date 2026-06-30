import { existsSync } from "node:fs";
import type { CliProgram } from "../types.ts";
import { resolveAppDir } from "./paths.ts";

/** Rewrites empty argv to `install` when the app is not yet installed (TTY only). */
export function maybeBootstrapInstallArgv(argv: string[], program: CliProgram): string[] {
  if (argv.length !== 0) {
    return argv;
  }
  if (program.install?.enabled === false) {
    return argv;
  }
  if (!process.stdin.isTTY) {
    return argv;
  }
  const appDir = resolveAppDir();
  const appPath = `${appDir}/${program.key}`;
  if (existsSync(appPath)) {
    return argv;
  }
  return ["install"];
}
