import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../types.ts";
import { createAppConfigSnapshot } from "./context.ts";
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
  });
});
