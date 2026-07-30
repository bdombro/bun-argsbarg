/*
Tests for install/status module behavior.
*/

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../../core/types.ts";
import { resolveInstallPaths } from "./paths.ts";
import { printInstallStatus } from "./status.ts";
import { resolveInstallTargetPreview } from "./target-scope.ts";

let home: string;
let prevHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "argsbarg-status-"));
  prevHome = process.env.HOME;
  process.env.HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

/** Tests for resolveInstallTargetPreview. */
describe("resolveInstallTargetPreview", () => {
  test("mcp app includes agentsMcp in all scope when mcpServer enabled", () => {
    const program: CliProgram = {
      key: "mcpapp",
      version: "1",
      description: "x",
      mcpServer: { enabled: true },
      handler: () => {},
    };
    const paths = resolveInstallPaths(program);
    const preview = resolveInstallTargetPreview(program, paths);
    expect(preview.all).toEqual(["agentsMcp"]);
    expect(preview.mcp).toEqual(["agentsMcp"]);
    expect(preview.skill).toEqual([]);
  });

  test("skill app includes skill in all scope when enabled", () => {
    const program: CliProgram = {
      key: "cliapp",
      version: "1",
      description: "x",
      skill: { enabled: true },
      handler: () => {},
    };
    const paths = resolveInstallPaths(program);
    const preview = resolveInstallTargetPreview(program, paths);
    expect(preview.all).toEqual(["skill"]);
    expect(preview.skill).toEqual(["skill"]);
    expect(preview.mcp).toEqual([]);
  });
});

/** Tests for printInstallStatus json. */
describe("printInstallStatus json", () => {
  test("includes effective scopes", () => {
    const program: CliProgram = {
      key: "app",
      version: "1",
      description: "x",
      mcpServer: { enabled: true },
      skill: { enabled: true },
      handler: () => {},
    };
    const chunks: string[] = [];
    const orig = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write;
    try {
      printInstallStatus(program, { json: true });
      const parsed = JSON.parse(chunks.join("")) as {
        effective: { all: string[]; mcp: string[]; skill: string[] };
      };
      expect(parsed.effective.all).toEqual(["skill", "agentsMcp"]);
      expect(parsed.effective.skill).toEqual(["skill"]);
      expect(parsed.effective.mcp).toEqual(["agentsMcp"]);
    } finally {
      process.stdout.write = orig;
    }
  });
});
