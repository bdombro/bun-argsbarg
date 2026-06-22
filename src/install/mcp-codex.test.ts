import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  codexMcpHasServer,
  readCodexMcpEntry,
  resolveCodexConfigPath,
} from "./mcp-codex.ts";

let home: string;
let prevHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "argsbarg-codex-"));
  prevHome = process.env.HOME;
  process.env.HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("codex mcp config", () => {
  test("readCodexMcpEntry parses simple command/args", () => {
    const path = resolveCodexConfigPath(home);
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      path,
      `[mcp_servers.testapp]
command = "testapp"
args = ["mcp"]
`,
      "utf8",
    );
    expect(readCodexMcpEntry(path, "testapp")).toEqual({
      command: "testapp",
      args: ["mcp"],
    });
    expect(codexMcpHasServer(home, "testapp")).toBe(true);
  });

  test("readCodexMcpEntry parses transport stdio block", () => {
    const path = resolveCodexConfigPath(home);
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      path,
      `[mcp_servers.testapp]
enabled = true
transport = { type = "stdio", command = "testapp", args = ["mcp"] }
`,
      "utf8",
    );
    expect(readCodexMcpEntry(path, "testapp")).toEqual({
      command: "testapp",
      args: ["mcp"],
    });
  });
});
