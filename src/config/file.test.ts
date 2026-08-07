/*
Tests for config/file module behavior.
*/

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CliProgram } from "../core/types.ts";
import { CONFIG_BINDINGS_KEY } from "./bindings.ts";
import { bootstrapAppConfig } from "./bootstrap.ts";
import {
  appConfigFileExists,
  ensureAppConfigFile,
  readAppConfigFile,
  resolveAppConfigDir,
  resolveAppConfigPath,
  uninstallAppConfig,
  writeAppConfigFile,
  writeAppConfigFileRaw,
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
  const prevTestHome = process.env.TEST_USER_HOME;
  process.env.TEST_USER_HOME = home;
  try {
    return fn(home);
  } finally {
    if (prevTestHome === undefined) delete process.env.TEST_USER_HOME;
    else process.env.TEST_USER_HOME = prevTestHome;
    rmSync(home, { recursive: true, force: true });
  }
}

/** Tests for config/file. */
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
      expect(resolveAppConfigPath(program)).toBe(join(home, ".local", "lib", "myapp", "config.json"));
    });
  });

  /** ResolveAppConfig prefers host env over file. */
  test("resolveAppConfig prefers host env over file", () => {
    withHome((_home) => {
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

  /** MissingRequiredConfig and formatMissingConfigMessage. */
  test("missingRequiredConfig and formatMissingConfigMessage", () => {
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const resolved = resolveAppConfig(program, {});
      const missing = missingRequiredConfig(program, resolved);
      expect(missing).toContain("apiToken");
      expect(missing).not.toContain("port");
      const msg = formatMissingConfigMessage(program, missing);
      expect(msg).toContain("configure");
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

  test("ensureAppConfigFile creates empty config", () => {
    withHome(() => {
      const created = ensureAppConfigFile(program);
      expect(created).toBe(resolveAppConfigPath(program));
      expect(appConfigFileExists(program)).toBe(true);
      expect(readAppConfigFile(program)).toEqual({});
    });
  });

  test("ensureAppConfigFile no-op when file exists", () => {
    withHome(() => {
      writeAppConfigFileRaw(program, { apiToken: "x" });
      expect(ensureAppConfigFile(program)).toBeNull();
    });
  });

  test("read allows _bindings framework key", () => {
    withHome(() => {
      writeAppConfigFileRaw(program, {
        [CONFIG_BINDINGS_KEY]: { apiToken: "env" },
      });
      expect(readAppConfigFile(program)).toEqual({
        [CONFIG_BINDINGS_KEY]: { apiToken: "env" },
      });
    });
  });

  test("partial write allows bindings without required keys", () => {
    withHome(() => {
      writeAppConfigFile(program, { [CONFIG_BINDINGS_KEY]: { apiToken: "env" } }, { partial: true });
      expect(readAppConfigFile(program)[CONFIG_BINDINGS_KEY]).toEqual({ apiToken: "env" });
    });
  });

  test("appConfigFileExists false when only directory exists", () => {
    withHome(() => {
      mkdirSync(resolveAppConfigDir(program), { recursive: true });
      expect(appConfigFileExists(program)).toBe(false);
    });
  });
});
