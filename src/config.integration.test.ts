/*
App config bootstrap and MCP config enforcement regressions.
*/

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapAppConfig } from "./config/bootstrap.ts";
import { mcpRequest, testProgram } from "./test-fixtures.ts";

test("bootstrapAppConfig prefers host env over config file", () => {
  const dir = mkdtempSync(join(tmpdir(), "argsbarg-env-"));
  const configFile = join(dir, "config");
  writeFileSync(configFile, `${JSON.stringify({ foo: "fromfile", bar: "bar" })}\n`, "utf8");
  process.env.FOO = "original";
  try {
    const p = testProgram({
      key: "app",
      version: "0",
      description: "",
      appConfig: {
        path: configFile,
        entries: {
          foo: { description: "x", env: "FOO" },
          bar: { description: "y", env: "BAR" },
        },
      },
      handler: () => {},
    });
    bootstrapAppConfig(p, { validateFile: true });
    expect(process.env.FOO).toBe("original");
    expect(process.env.BAR).toBe("bar");
  } finally {
    delete process.env.FOO;
    delete process.env.BAR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MCP program.appConfig fails when required config missing", async () => {
  const responses = await mcpRequest(
    [
      {
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: { name: "echo_env", arguments: { name: "ARGS_TEST_SECRET" } },
      },
    ],
    { script: "examples/mcp-test.ts", env: { ARGS_TEST_SECRET: "" } },
  );
  const res = responses.get(13) as { result: { isError: boolean; content: { text: string }[] } };
  expect(res.result.isError).toBe(true);
  expect(res.result.content[0]?.text).toContain("argsTestSecret");
});

test("MCP program.appConfig succeeds when env present", async () => {
  const responses = await mcpRequest(
    [
      {
        jsonrpc: "2.0",
        id: 14,
        method: "tools/call",
        params: { name: "echo_env", arguments: { name: "ARGS_TEST_SECRET" } },
      },
    ],
    { script: "examples/mcp-test.ts", env: { ARGS_TEST_SECRET: "sekrit" } },
  );
  const res = responses.get(14) as { result: { isError: boolean; content: { text: string }[] } };
  expect(res.result.isError).toBe(false);
  expect(res.result.content[0]?.text.trim()).toBe("sekrit");
});

test("MCP config file loads and exports vars for tool handlers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "argsbarg-mcp-"));
  const configFile = join(dir, "config");
  writeFileSync(
    configFile,
    `${JSON.stringify({ argsTestSecret: "file-value" }, null, 2)}\n`,
    "utf8",
  );
  const responses = await mcpRequest(
    [
      {
        jsonrpc: "2.0",
        id: 15,
        method: "tools/call",
        params: { name: "echo_env", arguments: { name: "ARGS_TEST_SECRET" } },
      },
    ],
    {
      script: "examples/mcp-test.ts",
      env: { ARGS_TEST_CONFIG_FILE: configFile, ARGS_TEST_SECRET: "present" },
    },
  );
  const res = responses.get(15) as { result: { isError: boolean; content: { text: string }[] } };
  expect(res.result.isError).toBe(false);
  expect(res.result.content[0]?.text.trim()).toBe("present");
});
