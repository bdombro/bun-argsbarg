#!/usr/bin/env bun

/** Back up release formula, write dev formula, run a command, then restore. Usage: bun scripts/with-dev-formula.ts -- brew install … */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createIdentity } from "./create-identity.ts";
import { renderDevFormula } from "./formula-shared.ts";

const { key } = createIdentity;
const root = join(import.meta.dir, "..");
const stagingDir = join(root, "Formula", ".staging");
const stagingPath = join(stagingDir, key);
const formulaPath = join(root, "Formula", `${key}.rb`);
const backupPath = join(stagingDir, `${key}.rb.bak`);

function backupReleaseFormula(): void {
  if (!existsSync(formulaPath)) {
    return;
  }
  mkdirSync(stagingDir, { recursive: true });
  copyFileSync(formulaPath, backupPath);
}

function restoreReleaseFormula(): void {
  if (!existsSync(backupPath)) {
    return;
  }
  copyFileSync(backupPath, formulaPath);
  unlinkSync(backupPath);
}

function writeDevFormula(): void {
  const distPath = join(root, "dist", key);
  mkdirSync(stagingDir, { recursive: true });
  copyFileSync(distPath, stagingPath);
  chmodSync(stagingPath, 0o755);

  const sha256 = createHash("sha256").update(readFileSync(stagingPath)).digest("hex");
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;
  writeFileSync(formulaPath, renderDevFormula(stagingPath, version, sha256), "utf8");
}

const sep = process.argv.indexOf("--");
if (sep === -1 || sep === process.argv.length - 1) {
  process.stderr.write("Usage: bun scripts/with-dev-formula.ts -- <command...>\n");
  process.exit(1);
}

const cmd = process.argv.slice(sep + 1);
const executable = cmd[0];
if (!executable) {
  process.stderr.write("Usage: bun scripts/with-dev-formula.ts -- <command...>\n");
  process.exit(1);
}
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
  const result = spawnSync(executable, cmd.slice(1), { stdio: "inherit" });
  process.exitCode = result.status === null ? 1 : result.status;
} finally {
  restore();
}

if (process.exitCode === 0) {
  console.log(`Restored ${formulaPath}`);
}
