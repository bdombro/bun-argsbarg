import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveAppConfigPath, writeAppConfigFile } from "../config/file.ts";
import { Cli, type CliProgram } from "../index.ts";

function configFixture(): CliProgram {
  return {
    key: "cfg-app",
    version: "1.0.0",
    description: "Config builtin test.",
    appConfig: {
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
    const prevHome = process.env.HOME;
    process.env.HOME = dir;
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const program = configFixture();
      const configPath = resolveAppConfigPath(program);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, `${JSON.stringify({ apiToken: "secret" })}\n`);
      const result = await new Cli(program).invoke(["config", "get", "apiToken"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("REDACTED");
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prev !== undefined) process.env.API_TOKEN = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("config get --json redacts sensitive as { set: true }", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-builtin-"));
    const prevHome = process.env.HOME;
    process.env.HOME = dir;
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const program = configFixture();
      const configPath = resolveAppConfigPath(program);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, `${JSON.stringify({ apiToken: "secret" })}\n`);
      const result = await new Cli(program).invoke(["config", "get", "apiToken", "--json"]);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ set: true });
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prev !== undefined) process.env.API_TOKEN = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("config set writes and resolves without required exit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-builtin-"));
    const prevHome = process.env.HOME;
    process.env.HOME = dir;
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const program = configFixture();
      writeAppConfigFile(program, { apiToken: "seed" });
      const result = await new Cli(program).invoke(["config", "set", "port", "9090"]);
      expect(result.exitCode).toBe(0);
      const get = await new Cli(program).invoke(["config", "get", "port"]);
      expect(get.stdout.trim()).toBe("9090");
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prev !== undefined) process.env.API_TOKEN = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
