/** Backup, write, and restore the release formula for local dev Homebrew installs. */

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

/** Path to the committed release formula (`Formula/full-example.rb`). */
export function releaseFormulaPath(): string {
  return formulaPath;
}

/** Gitignored backup path used during `install-local`. */
export function releaseFormulaBackupPath(): string {
  return backupPath;
}

/** Copy the release formula to `.staging` before overwriting with the dev formula. */
export function backupReleaseFormula(): void {
  if (!existsSync(formulaPath)) {
    return;
  }
  mkdirSync(stagingDir, { recursive: true });
  copyFileSync(formulaPath, backupPath);
}

/** Restore the release formula from backup; no-op when no backup exists. */
export function restoreReleaseFormula(): void {
  if (!existsSync(backupPath)) {
    return;
  }
  copyFileSync(backupPath, formulaPath);
  unlinkSync(backupPath);
}

/** Stage `dist/full-example` and overwrite `Formula/full-example.rb` with a local `file://` dev formula. */
export function writeDevFormula(): void {
  const distPath = join(root, "dist", key);
  mkdirSync(stagingDir, { recursive: true });
  copyFileSync(distPath, stagingPath);
  chmodSync(stagingPath, 0o755);

  const sha256 = createHash("sha256").update(readFileSync(stagingPath)).digest("hex");
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;
  writeFileSync(formulaPath, renderDevFormula(stagingPath, version, sha256), "utf8");
}
