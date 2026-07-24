/*
Tests for config/context module behavior.
*/

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CliProgram } from "../core/types.ts";
import { createAppConfigSnapshot } from "./context.ts";
import { resolveAppConfigDir, resolveAppConfigPath } from "./file.ts";
import { resolveAppConfig } from "./resolve.ts";

const program: CliProgram = {
  key: "ctx-test",
  version: "1.0.0",
  description: "Context test.",
  appConfig: {
    entries: {
      apiToken: { description: "Token.", env: "API_TOKEN" },
      note: { description: "Note.", required: false },
    },
  },
  handler: () => {},
};

/** Tests for config/context. */
describe("config/context", () => {
  /** Tests that AppConfigSnapshot get, require, read, set. */
  test("AppConfigSnapshot get, require, read, set", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctx-test-"));
    const prevHome = process.env.HOME;
    process.env.HOME = dir;
    const prevToken = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const path = resolveAppConfigPath(program);
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
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevToken === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prevToken;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** Tests that EmptyAppConfigSnapshot when program.appConfig unset. */
  test("EmptyAppConfigSnapshot when program.appConfig unset", () => {
    const programWithoutConfig: CliProgram = {
      key: "x",
      version: "1.0.0",
      description: "No config.",
      handler: () => {},
    };
    const empty = createAppConfigSnapshot(programWithoutConfig, {}, {});
    expect(empty.get("any")).toBeUndefined();
    expect(() => empty.set("any", "v")).toThrow(/program.appConfig is not set/);
    expect(empty.path).toContain("x");
    expect(empty.path.endsWith("/config.json") || empty.path.endsWith("\\config.json")).toBe(true);
    expect(empty.dir).toBe(dirname(empty.path));
  });

  test("AppConfigSnapshot path uses OS default from program key", () => {
    const ctx = createAppConfigSnapshot(program, {}, {});
    expect(ctx.path).toContain("ctx_test");
    expect(ctx.path.endsWith("/config.json") || ctx.path.endsWith("\\config.json")).toBe(true);
    expect(ctx.dir).toBe(resolveAppConfigDir(program));
    expect(ctx.dir).toBe(dirname(ctx.path));
  });

  test("AppConfigSnapshot unsafe read/write", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctx-unsafe-"));
    const prevHome = process.env.HOME;
    process.env.HOME = dir;
    const prevToken = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const fileData = { apiToken: "tok" };
      const resolved = resolveAppConfig(program, fileData);
      const ctx = createAppConfigSnapshot(program, fileData, resolved);
      expect(ctx.getUnsafe("apiToken")).toBe("tok");
      expect(ctx.readUnsafe().apiToken).toBe("tok");
      ctx.setUnsafe("note", "raw");
      expect(ctx.getUnsafe("note")).toBe("raw");
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevToken === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prevToken;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("EmptyAppConfigSnapshot unsafe read/write", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctx-empty-unsafe-"));
    const prevHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const programWithoutConfig: CliProgram = {
        key: "rawapp",
        version: "1.0.0",
        description: "No config.",
        handler: () => {},
      };
      const empty = createAppConfigSnapshot(programWithoutConfig, {}, {});
      empty.setUnsafe("custom", 42);
      expect(empty.getUnsafe("custom")).toBe(42);
      expect(empty.readUnsafe().custom).toBe(42);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
