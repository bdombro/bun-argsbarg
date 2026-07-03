#!/usr/bin/env bun
/** Generate Formula/full-example.rb for local dev install (same formula as release; file:// URL only). */

import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createIdentity } from "./create-identity.ts";
import { renderDevFormula } from "./formula-shared.ts";

const { key } = createIdentity;
const root = join(import.meta.dir, "..");
const distPath = join(root, "dist", key);
const stagingDir = join(root, "Formula", ".staging");
const stagingPath = join(stagingDir, key);

mkdirSync(stagingDir, { recursive: true });
copyFileSync(distPath, stagingPath);
chmodSync(stagingPath, 0o755);

const binary = readFileSync(stagingPath);
const sha256 = createHash("sha256").update(binary).digest("hex");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;

const out = join(root, "Formula", `${key}.rb`);
writeFileSync(out, renderDevFormula(stagingPath, version, sha256), "utf8");
console.log(`Wrote ${out}`);
