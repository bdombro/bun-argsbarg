import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../types.ts";
import { bootstrapAppConfig } from "./bootstrap.ts";
import { readAppConfigFile, resolveAppConfigPath, writeAppConfigFile } from "./file.ts";
import { buildProgramUserConfig } from "./manifest.ts";
import { formatMissingConfigMessage, missingRequiredConfig, resolveAppConfig } from "./resolve.ts";

const program: CliProgram = {
  key: "myapp",
  version: "1.0.0",
  description: "Demo.",
  appConfig: {
    path: "~/.config/myapp-test/config",
    entries: {
      apiToken: { description: "Token.", env: "API_TOKEN" },
      port: { description: "HTTP listen port (default 8080).", required: false },
    },
  },
  handler: () => {},
};

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

  test("resolveAppConfig prefers host env over file", () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-test-"));
    const prevHome = process.env.HOME;
    process.env.HOME = dir;
    const prevToken = process.env.API_TOKEN;
    process.env.API_TOKEN = "from-host";
    try {
      const p: CliProgram = {
        ...program,
        appConfig: {
          ...program.appConfig!,
          path: join(dir, ".config", "myapp-test", "config"),
        },
      };
      mkdirSync(join(dir, ".config", "myapp-test"), { recursive: true });
      writeFileSync(resolveAppConfigPath(p), `${JSON.stringify({ apiToken: "from-file" })}\n`);
      const resolved = resolveAppConfig(p, { apiToken: "from-file" });
      expect(resolved.apiToken).toBe("from-host");
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      if (prevToken === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prevToken;
      rmSync(dir, { recursive: true, force: true });
    }
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
    const dir = mkdtempSync(join(tmpdir(), "cfg-test-"));
    try {
      const p: CliProgram = {
        ...program,
        appConfig: {
          ...program.appConfig!,
          path: join(dir, "config"),
        },
      };
      writeFileSync(join(dir, "config"), `${JSON.stringify({ extra: true })}\n`);
      expect(() => readAppConfigFile(p)).toThrow(/Unknown config key/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("writeAppConfigFile round-trip", () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-test-"));
    try {
      const p: CliProgram = {
        ...program,
        appConfig: {
          ...program.appConfig!,
          path: join(dir, "config"),
        },
      };
      writeAppConfigFile(p, { apiToken: "saved" });
      const { resolved } = bootstrapAppConfig(p, { validateFile: true });
      expect(resolved.apiToken).toBe("saved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
