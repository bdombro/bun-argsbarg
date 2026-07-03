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

  test("completion subcommand emits bash script", () => {
    const proc = spawnSync("bun", [main, "completion", "bash"], { encoding: "utf8" });
    expect(proc.status).toBe(0);
    expect(proc.stdout).toContain("complete");
  });
});
