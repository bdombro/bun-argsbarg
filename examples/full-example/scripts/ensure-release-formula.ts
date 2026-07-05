#!/usr/bin/env bun
/** Normalize `Formula/full-example.rb` to the release layout; recover from a leftover dev formula. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  releaseFormulaPath,
  restoreReleaseFormula,
  releaseFormulaBackupPath,
} from "./dev-formula.ts";
import { renderReleaseFormula } from "./formula-shared.ts";

const formulaPath = releaseFormulaPath();
const backupPath = releaseFormulaBackupPath();

if (existsSync(backupPath)) {
  restoreReleaseFormula();
  console.log(`Restored release formula from ${backupPath}`);
}

let content = readFileSync(formulaPath, "utf8");
if (content.includes("file://")) {
  process.stderr.write(
    `Dev formula still present at ${formulaPath}. Run: git restore ${formulaPath}\n`,
  );
  process.exit(1);
}

const version = content.match(/^\s*version\s+"([^"]+)"/m)?.[1];
const sha256 = content.match(/^\s*sha256\s+"([^"]+)"/m)?.[1];
if (!version || !sha256) {
  process.stderr.write(`Could not parse version/sha256 from ${formulaPath}\n`);
  process.exit(1);
}

const normalized = renderReleaseFormula(version, sha256);
if (content !== normalized) {
  writeFileSync(formulaPath, normalized, "utf8");
  console.log(`Normalized ${formulaPath} (v${version})`);
} else {
  console.log(`Release formula OK: ${formulaPath} (v${version})`);
}
