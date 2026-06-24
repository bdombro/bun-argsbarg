import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cli, type CliProgram } from "../index.ts";

function configFixture(configPath: string): CliProgram {
  return {
    key: "cfg-app",
    version: "1.0.0",
    description: "Config builtin test.",
    appConfig: {
      path: configPath,
      entries: {
        apiToken: { description: "Token.", env: "API_TOKEN", sensitive: true },
        port: { description: "Port.", required: false },
      },
    },
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  };
}

describe("builtins/config", () => {
  test("config get redacts sensitive values", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-builtin-"));
    const configPath = join(dir, "config");
    writeFileSync(configPath, `${JSON.stringify({ apiToken: "secret" })}\n`);
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const result = await new Cli(configFixture(configPath)).invoke(["config", "get", "apiToken"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("REDACTED");
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("config get --json redacts sensitive as { set: true }", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-builtin-"));
    const configPath = join(dir, "config");
    writeFileSync(configPath, `${JSON.stringify({ apiToken: "secret" })}\n`);
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const result = await new Cli(configFixture(configPath)).invoke([
        "config",
        "get",
        "apiToken",
        "--json",
      ]);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout.trim())).toEqual({ set: true });
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("config set writes and resolves without required exit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-builtin-"));
    const configPath = join(dir, "config");
    writeFileSync(configPath, `${JSON.stringify({ apiToken: "present" })}\n`);
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const result = await new Cli(configFixture(configPath)).invoke([
        "config",
        "set",
        "port",
        "9090",
      ]);
      expect(result.exitCode).toBe(0);
      const get = await new Cli(configFixture(configPath)).invoke(["config", "get", "port"]);
      expect(get.stdout.trim()).toBe("9090");
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
