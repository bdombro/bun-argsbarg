import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CliProgram } from "../types.ts";
import { createAppConfigSnapshot } from "./context.ts";
import { resolveAppConfigDir } from "./file.ts";
import { resolveAppConfig } from "./resolve.ts";

function configProgram(configPath: string): CliProgram {
  return {
    key: "ctx-test",
    version: "1.0.0",
    description: "Context test.",
    appConfig: {
      path: configPath,
      entries: {
        apiToken: { description: "Token.", env: "API_TOKEN" },
        note: { description: "Note.", required: false },
      },
    },
    handler: () => {},
  };
}

describe("config/context", () => {
  test("AppConfigSnapshot get, require, read, set", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctx-test-"));
    const path = join(dir, "config");
    const program = configProgram(path);
    const prevToken = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const fileData = { apiToken: "tok", note: "hello" };
      const resolved = resolveAppConfig(program, fileData);
      const ctx = createAppConfigSnapshot(program, fileData, resolved);

      expect(ctx.get("note")).toBe("hello");
      expect(ctx.require("apiToken")).toBe("tok");
      expect(ctx.path).toBe(path);
      expect(ctx.dir).toBe(dirname(path));

      ctx.set("note", "updated");
      expect(ctx.get("note")).toBe("updated");
      expect(ctx.read().note).toBe("updated");
    } finally {
      if (prevToken === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prevToken;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("EmptyAppConfigSnapshot when program.appConfig unset", () => {
    const program: CliProgram = {
      key: "x",
      version: "1.0.0",
      description: "No config.",
      handler: () => {},
    };
    const empty = createAppConfigSnapshot(program, {}, {});
    expect(empty.get("any")).toBeUndefined();
    expect(() => empty.set("any", "v")).toThrow(/program.appConfig is not set/);
    expect(empty.path).toContain("x");
    expect(empty.path.endsWith("/config") || empty.path.endsWith("\\config")).toBe(true);
    expect(empty.dir).toBe(dirname(empty.path));
  });

  test("AppConfigSnapshot path uses OS default when program.appConfig.path omitted", () => {
    const program: CliProgram = {
      key: "ctx-test",
      version: "1.0.0",
      description: "Context test.",
      appConfig: {
        entries: { note: { description: "Note." } },
      },
      handler: () => {},
    };
    const ctx = createAppConfigSnapshot(program, {}, {});
    expect(ctx.path).toContain("ctx_test");
    expect(ctx.path.endsWith("/config") || ctx.path.endsWith("\\config")).toBe(true);
    expect(ctx.dir).toBe(resolveAppConfigDir(program));
    expect(ctx.dir).toBe(dirname(ctx.path));
  });

  test("resolveAppConfigDir honors custom program.appConfig.path", () => {
    const program = configProgram("/tmp/custom/settings.json");
    expect(resolveAppConfigDir(program)).toBe("/tmp/custom");
  });
});
