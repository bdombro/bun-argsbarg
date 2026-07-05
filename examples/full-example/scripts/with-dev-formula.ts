#!/usr/bin/env bun
/** Back up release formula, write dev formula, run a command, then restore. Usage: bun scripts/with-dev-formula.ts -- brew install … */

import { spawnSync } from "node:child_process";
import { backupReleaseFormula, releaseFormulaPath, restoreReleaseFormula, writeDevFormula } from "./dev-formula.ts";

const sep = process.argv.indexOf("--");
if (sep === -1 || sep === process.argv.length - 1) {
  process.stderr.write("Usage: bun scripts/with-dev-formula.ts -- <command...>\n");
  process.exit(1);
}

const cmd = process.argv.slice(sep + 1);
let restored = false;

function restore(): void {
  if (restored) {
    return;
  }
  restored = true;
  restoreReleaseFormula();
}

try {
  backupReleaseFormula();
  writeDevFormula();
  const result = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit" });
  process.exitCode = result.status === null ? 1 : result.status;
} finally {
  restore();
}

if (process.exitCode === 0) {
  console.log(`Restored ${releaseFormulaPath()}`);
}
