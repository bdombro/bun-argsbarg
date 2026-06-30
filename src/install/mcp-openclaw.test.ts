import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openclawMcpHasServer, resolveOpenclawConfigPath } from "./mcp-openclaw.ts";

let home: string;
let prevHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "argsbarg-openclaw-"));
  prevHome = process.env.HOME;
  process.env.HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("openclaw mcp config", () => {
  test("openclawMcpHasServer detects configured server", () => {
    const path = resolveOpenclawConfigPath(home);
    mkdirSync(join(home, ".openclaw"), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        mcp: {
          servers: {
            testapp: { command: "testapp", args: ["mcp"] },
          },
        },
      }),
      "utf8",
    );
    expect(openclawMcpHasServer(home, "testapp")).toBe(true);
    expect(openclawMcpHasServer(home, "other")).toBe(false);
  });
});
