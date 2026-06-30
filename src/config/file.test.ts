import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CliProgram } from "../types.ts";
import { bootstrapAppConfig } from "./bootstrap.ts";
import {
  readAppConfigFile,
  resolveAppConfigDir,
  resolveAppConfigPath,
  uninstallAppConfig,
  writeAppConfigFile,
} from "./file.ts";
import { buildProgramUserConfig } from "./manifest.ts";
import { formatMissingConfigMessage, missingRequiredConfig, resolveAppConfig } from "./resolve.ts";

const program: CliProgram = {
  key: "myapp",
  version: "1.0.0",
  description: "Demo.",
  appConfig: {
    entries: {
      apiToken: { description: "Token.", env: "API_TOKEN" },
      port: { description: "HTTP listen port (default 8080).", required: false },
    },
  },
  handler: () => {},
};

function withHome<T>(fn: (home: string) => T): T {
  const home = mkdtempSync(join(tmpdir(), "cfg-test-"));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  try {
    return fn(home);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(home, { recursive: true, force: true });
  }
}

describe("config/file", () => {
  test("buildProgramUserConfig from program.appConfig env entries", () => {
    const cfg = buildProgramUserConfig(program);
    expect(cfg?.api_token).toMatchObject({
      title: "apiToken",
      description: "Token.",
      required: true,
    });
    expect(cfg?.port).toBeUndefined();
  });

  test("resolveAppConfigPath uses config.json", () => {
    withHome((home) => {
      expect(resolveAppConfigPath(program)).toBe(
        join(home, ".local", "lib", "myapp", "config.json"),
      );
    });
  });

  test("resolveAppConfig prefers host env over file", () => {
    withHome((home) => {
      const prevToken = process.env.API_TOKEN;
      process.env.API_TOKEN = "from-host";
      try {
        const configPath = resolveAppConfigPath(program);
        mkdirSync(dirname(configPath), { recursive: true });
        writeFileSync(configPath, `${JSON.stringify({ apiToken: "from-file" })}\n`);
        const resolved = resolveAppConfig(program, { apiToken: "from-file" });
        expect(resolved.apiToken).toBe("from-host");
      } finally {
        if (prevToken === undefined) delete process.env.API_TOKEN;
        else process.env.API_TOKEN = prevToken;
      }
    });
  });

  test("missingRequiredConfig and formatMissingConfigMessage", () => {
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const resolved = resolveAppConfig(program, {});
      const missing = missingRequiredConfig(program, resolved);
      expect(missing).toContain("apiToken");
      expect(missing).not.toContain("port");
      const msg = formatMissingConfigMessage(program, missing);
      expect(msg).toContain("install --configure");
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
    }
  });

  test("rejects unknown keys on read", () => {
    withHome(() => {
      const configPath = resolveAppConfigPath(program);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, `${JSON.stringify({ extra: true })}\n`);
      expect(() => readAppConfigFile(program)).toThrow(/Unknown config key/);
    });
  });

  test("writeAppConfigFile round-trip", () => {
    withHome(() => {
      writeAppConfigFile(program, { apiToken: "saved" });
      const { resolved } = bootstrapAppConfig(program, { validateFile: true });
      expect(resolved.apiToken).toBe("saved");
    });
  });

  test("uninstallAppConfig removes config directory recursively", () => {
    withHome(() => {
      writeAppConfigFile(program, { apiToken: "saved" });
      const configPath = resolveAppConfigPath(program);
      const configDir = resolveAppConfigDir(program);
      writeFileSync(join(configDir, "extra.txt"), "leftover", "utf8");
      expect(uninstallAppConfig(program, false)).toEqual([configPath, `${configDir}/`]);
      expect(existsSync(configPath)).toBe(false);
      expect(existsSync(configDir)).toBe(false);
    });
  });
});
