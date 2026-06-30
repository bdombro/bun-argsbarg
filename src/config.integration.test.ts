/*
App config bootstrap and MCP config enforcement regressions.
*/

import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bootstrapAppConfig } from "./config/bootstrap.ts";
import { resolveAppConfigPath } from "./config/file.ts";
import { mcpRequest, testProgram } from "./test-fixtures.ts";

test("bootstrapAppConfig prefers host env over config file", () => {
  const dir = mkdtempSync(join(tmpdir(), "argsbarg-env-"));
  const prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.FOO = "original";
  try {
    const p = testProgram({
      key: "app",
      version: "0",
      description: "",
      appConfig: {
        entries: {
          foo: { description: "x", env: "FOO" },
          bar: { description: "y", env: "BAR" },
        },
      },
      handler: () => {},
    });
    const configFile = resolveAppConfigPath(p);
    mkdirSync(dirname(configFile), { recursive: true });
    writeFileSync(configFile, `${JSON.stringify({ foo: "fromfile", bar: "bar" })}\n`, "utf8");
    bootstrapAppConfig(p, { validateFile: true });
    expect(process.env.FOO).toBe("original");
    expect(process.env.BAR).toBe("bar");
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
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
  const configFile = join(dir, ".local", "lib", "mcp_test", "config");
  mkdirSync(dirname(configFile), { recursive: true });
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
      env: { HOME: dir, ARGS_TEST_SECRET: "present" },
    },
  );
  const res = responses.get(15) as { result: { isError: boolean; content: { text: string }[] } };
  expect(res.result.isError).toBe(false);
  expect(res.result.content[0]?.text.trim()).toBe("present");
  rmSync(dir, { recursive: true, force: true });
});

test("Cli.run docs api skips required appConfig exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "argsbarg-docs-skip-"));
  const configFile = join(dir, ".local", "lib", "docs_skip_test", "config");
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(configFile, "{}\n");
  const entry = join(import.meta.dir, "index.ts");
  const mainPath = join(dir, "run-docs.ts");
  writeFileSync(
    mainPath,
    `import { Cli, type CliProgram } from ${JSON.stringify(entry)};
const program = {
  key: "docs-skip-test",
  version: "1.0.0",
  description: "test",
  docs: { enabled: true, topics: { readme: { text: "# readme\\n" } } },
  appConfig: {
    entries: { token: { description: "Token.", env: "DOCS_SKIP_RUN_TOKEN" } },
  },
  handler: () => {},
} satisfies CliProgram;
await new Cli(program).run(process.argv.slice(2));
`,
  );
  const env = { ...process.env, HOME: dir } as Record<string, string | undefined>;
  delete env.DOCS_SKIP_RUN_TOKEN;
  try {
    const proc = Bun.spawn(["bun", "run", mainPath, "docs", "api"], {
      stdout: "pipe",
      stderr: "pipe",
      env,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("# docs-skip-test — CLI API reference");
    expect(stderr).not.toContain("Missing required configuration");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
