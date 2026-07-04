import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const main = join(import.meta.dir, "main.ts");

describe("argsbarg cli-tool", () => {
  test("version subcommand prints version", () => {
    const proc = spawnSync("bun", [main, "version"], { encoding: "utf8" });
    expect(proc.status).toBe(0);
    expect(proc.stdout.trim().length).toBeGreaterThan(0);
  });

  test("help lists create and version only (no install, completion, mcp)", () => {
    const proc = spawnSync("bun", [main, "--help"], { encoding: "utf8" });
    expect(proc.status).toBe(0);
    expect(proc.stdout).toContain("create");
    expect(proc.stdout).toContain("version");
    expect(proc.stdout).not.toContain("configure");
    expect(proc.stdout).not.toContain("completion");
    expect(proc.stdout).not.toContain("mcp");
  });

  test("completion subcommand is disabled", () => {
    const proc = spawnSync("bun", [main, "completion", "bash"], { encoding: "utf8" });
    expect(proc.status).toBe(1);
    expect(proc.stderr).toContain("Shell completion is not available");
  });
});
