import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../types.ts";
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

describe("resolveInstallTargetPreview", () => {
  test("mcp app previews MCP keys for all and mcp scopes", () => {
    const program: CliProgram = {
      key: "mcpapp",
      version: "1",
      description: "x",
      mcpServer: { enabled: true },
      handler: () => {},
    };
    const paths = resolveInstallPaths(program);
    const preview = resolveInstallTargetPreview(program, paths);
    expect(preview.agentIntegration).toBe("mcp");
    expect(preview.all).toContain("app");
    expect(preview.all).toContain("completions");
    expect(preview.skill).toEqual([]);
  });

  test("shell app previews skill keys", () => {
    const program: CliProgram = {
      key: "cliapp",
      version: "1",
      description: "x",
      handler: () => {},
    };
    const paths = resolveInstallPaths(program);
    const preview = resolveInstallTargetPreview(program, paths);
    expect(preview.agentIntegration).toBe("skill");
    expect(preview.all).toContain("app");
    expect(preview.mcp).toEqual([]);
  });
});

describe("printInstallStatus json", () => {
  test("includes agentIntegration and effective scopes", () => {
    const program: CliProgram = {
      key: "app",
      version: "1",
      description: "x",
      mcpServer: { enabled: true },
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
        agentIntegration: string;
        effective: { all: string[]; mcp: string[]; skill: string[] };
      };
      expect(parsed.agentIntegration).toBe("mcp");
      expect(parsed.effective.all).toContain("app");
      expect(Array.isArray(parsed.effective.skill)).toBe(true);
    } finally {
      process.stdout.write = orig;
    }
  });
});
