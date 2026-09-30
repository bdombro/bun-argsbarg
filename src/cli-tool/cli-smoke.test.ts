/*
Tests for cli-tool/cli-smoke module behavior.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, test } from "node:test";

const main = join(import.meta.dirname, "main.ts");

/** Tests for argsbarg cli-tool. */
describe("argsbarg cli-tool", () => {
  test("version subcommand prints version", () => {
    const proc = spawnSync(process.execPath, [main, "version"], { encoding: "utf8" });
    assert.equal(proc.status, 0);
    assert.ok(proc.stdout.trim().length > 0);
  });

  test("help lists create and version only (no install, completion, mcp)", () => {
    const proc = spawnSync(process.execPath, [main, "--help"], { encoding: "utf8" });
    assert.equal(proc.status, 0);
    assert.ok(proc.stdout.includes("create"));
    assert.ok(proc.stdout.includes("version"));
    assert.ok(!proc.stdout.includes("configure"));
    assert.ok(!proc.stdout.includes("completion"));
    assert.ok(!proc.stdout.includes("mcp"));
  });

  test("completion subcommand is disabled", () => {
    const proc = spawnSync(process.execPath, [main, "completion", "bash"], { encoding: "utf8" });
    assert.equal(proc.status, 1);
    assert.ok(proc.stderr.includes("Shell completion is not available"));
  });
});
