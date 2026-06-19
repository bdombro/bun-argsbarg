/*
This test file covers parsing, validation, and completion regressions.
It exercises the public API rather than internal helpers so the tests follow the same
paths that users and example CLIs take.

It keeps the CLI contract stable by catching routing, option handling, and generated
shell output regressions.
*/

import { completionBashScript, completionZshScript } from "./completion.ts";
import { cliHelpRender } from "./help.ts";
import { CliCommand, CliFallbackMode, CliOptionKind, cliInvoke } from "./index.ts";
import {
  allMcpResources,
  collectMcpTools,
  mcpToolCallToArgv,
  mcpToolDescription,
  sanitizeToolSegment,
} from "./mcp/tools.ts";
import { applyShellEnv, loadEnvFile } from "./mcp/env.ts";
import { buildToolCallSuccess } from "./mcp/result.ts";
import { generateSkillBundle } from "./skill/generate.ts";
import { cliSkillInstall } from "./skill/install.ts";
import { ParseKind, parse, postParseValidate } from "./parse.ts";
import { cliSchemaJson } from "./schema.ts";
import { cliValidateRoot } from "./validate.ts";
import { expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("bundled short presence flags", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        options: [
          {
            name: "a",
            description: "",
            kind: CliOptionKind.Presence,
            shortName: "a",
          },
          {
            name: "b",
            description: "",
            kind: CliOptionKind.Presence,
            shortName: "b",
          },
        ],
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["x", "-ab"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.opts["a"]).toBe("1");
  expect(pr.opts["b"]).toBe("1");
});

test("long option equals", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        options: [
          {
            name: "name",
            description: "",
            kind: CliOptionKind.String,
          },
        ],
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["x", "--name=pat"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.opts["name"]).toBe("pat");
});

test("fallback missing or unknown root flags", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "hello",
        description: "Say hi.",
        options: [
          {
            name: "name",
            description: "",
            kind: CliOptionKind.String,
          },
        ],
        handler: () => {},
      },
    ],
    fallbackCommand: "hello",
    fallbackMode: CliFallbackMode.MissingOrUnknown,
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["--name", "bob"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.path).toEqual(["hello"]);
  expect(pr.opts["name"]).toBe("bob");
});

test("unknown command", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [{ key: "hello", description: "", handler: () => {} }],
  };
  cliValidateRoot(root);
  const pr = parse(root, ["nope"]);
  expect(pr.kind).toBe(ParseKind.Error);
  expect(pr.errorMsg).toContain("Unknown command");
});

test("implicit help empty", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [{ key: "x", description: "", handler: () => {} }],
  };
  cliValidateRoot(root);
  const pr = parse(root, []);
  expect(pr.kind).toBe(ParseKind.Help);
  expect(pr.helpExplicit).toBe(false);
});

test("invalid number post validate", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        options: [
          {
            name: "n",
            description: "",
            kind: CliOptionKind.Number,
          },
        ],
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  let pr = parse(root, ["x", "--n", "notnum"]);
  pr = postParseValidate(root, pr);
  expect(pr.kind).toBe(ParseKind.Error);
  expect(pr.errorMsg).toContain("Invalid number");
});

test("supports scientific notation in numbers", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        options: [
          {
            name: "n",
            description: "",
            kind: CliOptionKind.Number,
          },
        ],
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  let pr = parse(root, ["x", "--n", "1.23e4"]);
  pr = postParseValidate(root, pr);
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(Number(pr.opts["n"])).toBe(12300);
});



test("completion scripts contain app name", () => {
  const root: CliCommand = {
    key: "myapp",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  };
  cliValidateRoot(root);
  const bash = completionBashScript(root);
  expect(bash).toContain("bash completion for myapp");
  expect(bash).toContain("complete -F _myapp myapp");

  const zsh = completionZshScript(root);
  expect(zsh).toContain("#compdef myapp");
  expect(zsh).toContain("compdef _myapp myapp");
  expect(zsh).toContain("hello:Say hello.");
});

test("completion scripts do not emit invalid bash substitutions", () => {
  const root: CliCommand = {
    key: "app",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  };
  cliValidateRoot(root);
  const bash = completionBashScript(root);
  expect(bash).not.toContain("${${");
});

test("completion scripts escape shell-sensitive command text in zsh", () => {
  const root: CliCommand = {
    key: "app",
    description: "Test",
    commands: [
      {
        key: "quote'cmd",
        description: "Say 'hello' and keep going.",
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const zsh = completionZshScript(root);
  expect(zsh).toContain("quote'\\''cmd:Say '\\''hello'\\'' and keep going.");
});

test("completion scripts keep dotted app names in registration names", () => {
  const root: CliCommand = {
    key: "minimal.ts",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  };
  cliValidateRoot(root);

  const bash = completionBashScript(root);
  expect(bash).toContain("complete -F _minimal_ts minimal.ts");

  const zsh = completionZshScript(root);
  expect(zsh).toContain("compdef _minimal_ts minimal.ts");
});

test("trailing options after bounded positionals", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        options: [
          {
            name: "verbose",
            description: "",
            kind: CliOptionKind.Presence,
          },
        ],
        positionals: [
          {
            name: "path",
            description: "",
            kind: CliOptionKind.String,
          },
        ],
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["x", "./file", "--verbose"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["./file"]);
  expect(pr.opts["verbose"]).toBe("1");
});

test("trailing options include parent-scoped flags", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "group",
        description: "group",
        options: [
          {
            name: "json",
            description: "",
            kind: CliOptionKind.Presence,
          },
        ],
        commands: [
          {
            key: "leaf",
            description: "leaf",
            options: [
              {
                name: "user",
                description: "",
                kind: CliOptionKind.String,
                shortName: "u",
              },
            ],
            positionals: [
              {
                name: "path",
                description: "",
                kind: CliOptionKind.String,
              },
            ],
            handler: () => {},
          },
        ],
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["group", "leaf", "-u", "alice", "./file", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.path).toEqual(["group", "leaf"]);
  expect(pr.args).toEqual(["./file"]);
  expect(pr.opts["user"]).toBe("alice");
  expect(pr.opts["json"]).toBe("1");
});

test("varargs tail parses trailing options", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        options: [
          {
            name: "json",
            description: "",
            kind: CliOptionKind.Presence,
          },
        ],
        positionals: [
          {
            name: "files",
            description: "",
            kind: CliOptionKind.String,
            argMin: 0,
            argMax: 0,
          },
        ],
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["x", "./file", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["./file"]);
  expect(pr.opts["json"]).toBe("1");
});

test("stops parsing options at --", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        options: [
          {
            name: "name",
            description: "",
            kind: CliOptionKind.String,
          },
        ],
        positionals: [
          {
            name: "files",
            description: "",
            kind: CliOptionKind.String,
            argMin: 0,
            argMax: 0,
          },
        ],
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["x", "--name", "pat", "--", "--name", "bob", "-x"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.opts["name"]).toBe("pat");
  expect(pr.args).toEqual(["--name", "bob", "-x"]);
});

test("missing required option returns error", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    options: [
      {
        name: "req",
        description: "",
        kind: CliOptionKind.String,
        required: true,
      },
    ],
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["x"]));
  expect(pr.kind).toBe(ParseKind.Error);
  expect(pr.errorMsg).toContain("Missing required option: --req");
});

test("provided required option parses ok", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        options: [
          {
            name: "req",
            description: "",
            kind: CliOptionKind.String,
            required: true,
          },
        ],
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["x", "--req", "val"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.opts["req"]).toBe("val");
});

test("presence option cannot be required", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    options: [
      {
        name: "flag",
        description: "",
        kind: CliOptionKind.Presence,
        required: true,
      },
    ],
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
    ],
  };
  expect(() => cliValidateRoot(root)).toThrow(/Presence option cannot be required/);
});

test("leaf completion help prints correctly", async () => {
  // Test the fix where `completion zsh -h` on a leaf root was incorrectly ignored.
  // We run this as a subprocess so we don't accidentally exit the test runner.
  const { stdout, stderr, exitCode } = await $`bun run examples/minimal.ts completion zsh -h`.nothrow().quiet();
  const out = stdout.toString();
  expect(exitCode).toBe(0);
  expect(out).toContain("Show help for this command.");
  expect(out).toContain("Output is the whole script.");
  expect(stderr.toString()).toBe("");
});

test("--schema exports JSON for nested CLIs", async () => {
  const { stdout, stderr, exitCode } = await $`bun run examples/nested.ts --schema`.nothrow().quiet();
  expect(exitCode).toBe(0);
  expect(stderr.toString()).toBe("");

  const schema = JSON.parse(stdout.toString());
  expect(schema.key).toBe("nested.ts");
  expect(schema.fallbackCommand).toBe("read");
  expect(schema.commands.map((c: { key: string }) => c.key)).toEqual(["stat", "read"]);
  expect(schema.commands).not.toContainEqual(expect.objectContaining({ key: "completion" }));

  const lookup = schema.commands[0].commands[0].commands[0];
  expect(lookup.key).toBe("lookup");
  expect(lookup.positionals[0].name).toBe("path");
});

test("--schema exports JSON for leaf roots", async () => {
  const { stdout, exitCode } = await $`bun run examples/minimal.ts --schema`.nothrow().quiet();
  expect(exitCode).toBe(0);

  const schema = JSON.parse(stdout.toString());
  expect(schema.key).toBe("minimal.ts");
  expect(schema.positionals[0].name).toBe("name");
  expect(schema.options[0].name).toBe("verbose");
  expect(schema.commands.map((c: { key: string }) => c.key)).toEqual(["completion"]);
});

test("leaf root help lists completion built-in", async () => {
  const { stdout, exitCode } = await $`bun run examples/minimal.ts -h`.nothrow().quiet();
  expect(exitCode).toBe(0);
  expect(stdout.toString()).toContain("completion");
  expect(stdout.toString()).toContain("Generate the autocompletion script for shells.");
});

test("parse recognizes --schema at the program root", () => {
  const root: CliCommand = {
    key: "app",
    description: "demo",
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
    ],
  };
  cliValidateRoot(root);
  const pr = parse(root, ["--schema"]);
  expect(pr.kind).toBe(ParseKind.Schema);
});

test("cliSchemaJson omits handlers and completion built-ins", () => {
  const root: CliCommand = {
    key: "app",
    description: "demo",
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
      {
        key: "completion",
        description: "should not appear",
        commands: [
          {
            key: "bash",
            description: "",
            handler: () => {},
          },
        ],
      },
    ],
  };

  const schema = JSON.parse(cliSchemaJson(root));
  expect(schema.commands).toHaveLength(1);
  expect(schema.commands[0].key).toBe("x");
  expect(schema).not.toHaveProperty("handler");
});

test("reserved option name schema is rejected", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        options: [
          {
            name: "schema",
            description: "",
            kind: CliOptionKind.String,
          },
        ],
        handler: () => {},
      },
    ],
  };
  expect(() => cliValidateRoot(root)).toThrow(/reserved for --schema/);
});

test("root help lists --schema built-in", () => {
  const root: CliCommand = {
    key: "app",
    description: "demo",
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
    ],
  };
  const help = cliHelpRender(root, [], false);
  expect(help).toContain("--schema");
  expect(help).toContain("Print the full command tree as JSON.");
});

test("nested help omits --schema built-in", () => {
  const root: CliCommand = {
    key: "app",
    description: "demo",
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
    ],
  };
  const help = cliHelpRender(root, ["x"], false);
  expect(help).not.toContain("--schema");
});

test("completion scripts offer --schema at the program root only", () => {
  const root: CliCommand = {
    key: "myapp",
    description: "",
    commands: [
      {
        key: "stat",
        description: "stats",
        commands: [
          {
            key: "show",
            description: "show",
            handler: () => {},
          },
        ],
      },
    ],
  };

  const bash = completionBashScript(root);
  expect(bash).toContain("A_myapp_0_opts+=('--schema')");
  expect(bash).not.toContain("A_myapp_1_opts+=('--schema')");

  const zsh = completionZshScript(root);
  expect(zsh).toContain("'--schema:Print the full command tree as JSON.'");
});

const nestedMcpFixture: CliCommand = {
  key: "nested.ts",
  description: "Nested groups demo.",
  mcpServer: { name: "nested-demo", version: "1.0.0" },
  commands: [
    {
      key: "stat",
      description: "File metadata.",
      options: [
        {
          name: "json",
          description: "Emit handler output as JSON.",
          kind: CliOptionKind.Presence,
        },
      ],
      commands: [
        {
          key: "owner",
          description: "Ownership helpers.",
          commands: [
            {
              key: "lookup",
              description: "Resolve owner info.",
              options: [
                {
                  name: "user-name",
                  description: "User to look up.",
                  kind: CliOptionKind.String,
                  shortName: "u",
                },
              ],
              positionals: [
                {
                  name: "path",
                  description: "File or directory.",
                  kind: CliOptionKind.String,
                },
              ],
              handler: () => {},
            },
          ],
        },
      ],
    },
    {
      key: "read",
      description: "Print the first line of each file.",
      positionals: [
        {
          name: "files",
          description: "Paths to read.",
          kind: CliOptionKind.String,
          argMax: 0,
        },
      ],
      handler: () => {},
    },
    {
      key: "hidden",
      description: "Internal debug.",
      mcpTool: { enabled: false },
      handler: () => {},
    },
  ],
  fallbackCommand: "read",
  fallbackMode: CliFallbackMode.MissingOrUnknown,
};

/** Sends NDJSON MCP requests to a subprocess and collects responses by id. */
async function mcpRequest(
  requests: object[],
  opts?: { script?: string; env?: Record<string, string> },
): Promise<Map<string | number, object>> {
  const script = opts?.script ?? "examples/nested.ts";
  const proc = Bun.spawn(["bun", "run", script, "ai", "mcp"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: opts?.env ? { ...process.env, ...opts.env } : process.env,
  });

  const input = requests.map((r) => JSON.stringify(r) + "\n").join("");
  proc.stdin.write(input);
  proc.stdin.end();

  const timeout = setTimeout(() => proc.kill(), 10_000);
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  clearTimeout(timeout);

  const byId = new Map<string | number, object>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const msg = JSON.parse(trimmed) as { id?: string | number };
    if (msg.id !== undefined) {
      byId.set(msg.id, msg);
    }
  }
  return byId;
}

test("sanitizeToolSegment normalizes dotted app keys", () => {
  expect(sanitizeToolSegment("minimal.ts")).toBe("minimal_ts");
});

test("mcpToolDescription formats CLI path and root-leaf prefix", () => {
  expect(mcpToolDescription(["stat", "owner", "lookup"], "nested.ts", "Resolve owner info.")).toBe(
    "stat owner lookup — Resolve owner info.",
  );
  expect(mcpToolDescription(["read"], "nested.ts", "Print files.")).toBe("read — Print files.");
  expect(mcpToolDescription([], "helloapp", "Tiny demo.")).toBe("helloapp — Tiny demo.");
});

test("collectMcpTools lists user leaf commands only", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const names = tools.map((t) => t.name);
  expect(names).toContain("stat_owner_lookup");
  expect(names).toContain("read");
  expect(names).not.toContain("hidden");
  expect(names).not.toContain("ai");
  expect(names).not.toContain("completion");
  const lookup = tools.find((t) => t.name === "stat_owner_lookup")!;
  expect(lookup.description).toBe("stat owner lookup — Resolve owner info.");
});

test("collectMcpTools merges parent options into inputSchema", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const lookup = tools.find((t) => t.name === "stat_owner_lookup")!;
  const schema = lookup.inputSchema as { properties: Record<string, unknown>; required?: string[] };
  expect(schema.properties.json).toBeDefined();
  expect(schema.required).toContain("path");
});

test("mcpToolCallToArgv builds nested lookup argv", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const lookup = tools.find((t) => t.name === "stat_owner_lookup")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, lookup, {
    "user-name": "alice",
    path: "./x",
    json: true,
  });
  expect(argv).toEqual(["stat", "owner", "lookup", "--json", "--user-name", "alice", "./x"]);
});

test("mcpToolCallToArgv expands varargs positionals", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: ["a", "b"] });
  expect(argv).toEqual(["read", "a", "b"]);
});

test("reserved command name ai is rejected", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "ai",
        description: "bad",
        handler: () => {},
      },
    ],
  };
  expect(() => cliValidateRoot(root)).toThrow(/Reserved command name: ai/);
});

test("top-level command name mcp is allowed", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "mcp",
        description: "user command",
        handler: () => {},
      },
    ],
  };
  expect(() => cliValidateRoot(root)).not.toThrow();
});

test("mcpServer on non-root node is rejected", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "cmd",
        mcpServer: {},
        handler: () => {},
      },
    ],
  };
  expect(() => cliValidateRoot(root)).toThrow(/mcpServer is only supported on the program root/);
});

test("mcpTool on root is rejected", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    mcpTool: { enabled: false },
    handler: () => {},
  };
  expect(() => cliValidateRoot(root)).toThrow(/mcpTool is only supported on leaf commands/);
});

test("mcpTool on routing node is rejected", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "group",
        description: "group",
        mcpTool: { enabled: false },
        commands: [
          {
            key: "leaf",
            description: "leaf",
            handler: () => {},
          },
        ],
      },
    ],
  };
  expect(() => cliValidateRoot(root)).toThrow(/mcpTool is only supported on leaf commands/);
});

test("buildToolCallSuccess returns stdout only", () => {
  const result = buildToolCallSuccess("hello\n", "");
  expect(result.isError).toBe(false);
  expect(result.content).toEqual([{ type: "text", text: "hello\n" }]);
  expect(result.structuredContent).toBeUndefined();
});

test("buildToolCallSuccess adds stderr as second content block", () => {
  const result = buildToolCallSuccess("out\n", "warn\n");
  expect(result.content).toEqual([
    { type: "text", text: "out\n" },
    { type: "text", text: "warn" },
  ]);
  expect(result.structuredContent).toBeUndefined();
});

test("buildToolCallSuccess stderr-only still includes stdout slot", () => {
  const result = buildToolCallSuccess("", "warn\n");
  expect(result.content).toEqual([
    { type: "text", text: "" },
    { type: "text", text: "warn" },
  ]);
});

test("buildToolCallSuccess parses JSON structuredContent", () => {
  const result = buildToolCallSuccess('{"a":1}\n', "");
  expect(result.structuredContent).toEqual({ a: 1 });
  expect(result.content[0]!.text).toBe('{"a":1}\n');
});

test("buildToolCallSuccess skips structuredContent for plain text", () => {
  const result = buildToolCallSuccess("lookup user=x\n", "");
  expect(result.structuredContent).toBeUndefined();
});

test("buildToolCallSuccess parses JSON primitives", () => {
  const result = buildToolCallSuccess("true\n", "");
  expect(result.structuredContent).toBe(true);
});

test("MCP initialize returns tools and resources capabilities", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }]);
  const res = responses.get(1) as { result: { capabilities: Record<string, unknown> } };
  expect(res.result.capabilities.tools).toBeDefined();
  expect(res.result.capabilities.resources).toBeDefined();
});

test("MCP tools/list includes stat_owner_lookup", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }]);
  const res = responses.get(2) as { result: { tools: { name: string; inputSchema: { required?: string[] } }[] } };
  const lookup = res.result.tools.find((t) => t.name === "stat_owner_lookup");
  expect(lookup).toBeDefined();
  expect(lookup!.inputSchema.required).toContain("path");
});

test("MCP resources/read returns schema JSON", async () => {
  const responses = await mcpRequest([
    { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "argsbarg://schema" } },
  ]);
  const res = responses.get(3) as { result: { contents: { text: string }[] } };
  const schema = JSON.parse(res.result.contents[0]!.text);
  expect(schema.key).toBe("nested.ts");
});

test("MCP tools/call runs stat_owner_lookup", async () => {
  const readme = join(import.meta.dir, "..", "README.md");
  const responses = await mcpRequest([
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "stat_owner_lookup",
        arguments: { path: readme, "user-name": "test" },
      },
    },
  ]);
  const res = responses.get(4) as { result: { content: { text: string }[]; isError: boolean } };
  expect(res.result.isError).toBe(false);
  expect(res.result.content[0]!.text).toContain("lookup user=test");
});

test("MCP tools/call returns structuredContent for JSON stdout", async () => {
  const readme = join(import.meta.dir, "..", "README.md");
  const responses = await mcpRequest([
    {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "stat_owner_lookup",
        arguments: { path: readme, "user-name": "test", json: true },
      },
    },
  ]);
  const res = responses.get(6) as {
    result: {
      content: { text: string }[];
      structuredContent?: { user: string; path: string };
      isError: boolean;
    };
  };
  expect(res.result.isError).toBe(false);
  expect(res.result.structuredContent).toEqual({ user: "test", path: readme });
  expect(JSON.parse(res.result.content[0]!.text.trim())).toEqual({ user: "test", path: readme });
});

test("MCP tools/call errors on missing required positional", async () => {
  const responses = await mcpRequest([
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "stat_owner_lookup", arguments: { "user-name": "test" } },
    },
  ]);
  const res = responses.get(5) as { result: { isError: boolean; content: { text: string }[] } };
  expect(res.result.isError).toBe(true);
  expect(res.result.content[0]!.text).toContain("Missing argument: path");
});

test("MCP ping returns empty result", async () => {
  const responses = await mcpRequest([{ jsonrpc: "2.0", id: 99, method: "ping", params: {} }]);
  const res = responses.get(99) as { result: Record<string, never> };
  expect(res.result).toEqual({});
});

test("minimal.ts ai mcp without opt-in fails", async () => {
  const { stderr, exitCode } = await $`bun run examples/minimal.ts ai mcp`.nothrow().quiet();
  expect(exitCode).toBe(1);
  expect(stderr.toString()).toContain("MCP is not enabled");
});

test("ctx.invocation is cli via cliRun", async () => {
  const indexPath = join(import.meta.dir, "index.ts");
  const { stdout } = await $`bun -e ${`
import { cliRun, CliCommand } from ${JSON.stringify(indexPath)};
const cli = { key: "t", description: "d", handler: (ctx) => console.log(ctx.invocation) };
await cliRun(cli, []);
  `}`.quiet();
  expect(stdout.toString().trim()).toBe("cli");
});

test("ctx.invocation is mcp via cliInvoke", async () => {
  let seen = "";
  const root: CliCommand = {
    key: "app",
    description: "",
    handler: (ctx) => {
      seen = ctx.invocation;
    },
  };
  cliValidateRoot(root);
  const result = await cliInvoke(root, []);
  expect(result.kind).toBe("ok");
  expect(seen).toBe("mcp");
});

const enumMcpFixture: CliCommand = {
  key: "app",
  description: "",
  mcpServer: {},
  commands: [
    {
      key: "run",
      description: "Run with mode.",
      options: [
        {
          name: "mode",
          description: "Mode.",
          kind: CliOptionKind.Enum,
          choices: ["dev", "prod"],
          required: true,
        },
      ],
      handler: () => {},
    },
  ],
};

test("Enum option inputSchema includes enum array", () => {
  const tools = collectMcpTools(enumMcpFixture);
  const run = tools.find((t) => t.name === "run")!;
  const schema = run.inputSchema as { properties: { mode: { enum?: string[] } } };
  expect(schema.properties.mode.enum).toEqual(["dev", "prod"]);
});

test("cliInvoke rejects invalid Enum value", async () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    handler: () => {},
    options: [
      {
        name: "mode",
        description: "Mode.",
        kind: CliOptionKind.Enum,
        choices: ["dev", "prod"],
        required: true,
      },
    ],
  };
  cliValidateRoot(root);
  const result = await cliInvoke(root, ["--mode", "staging"]);
  expect(result.kind).toBe("error");
  expect(result.errorMsg).toContain("not one of");
});

test("cliInvoke accepts valid Enum value", async () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    handler: (ctx) => {
      console.log(ctx.stringOpt("mode"));
    },
    options: [
      {
        name: "mode",
        description: "Mode.",
        kind: CliOptionKind.Enum,
        choices: ["dev", "prod"],
        required: true,
      },
    ],
  };
  cliValidateRoot(root);
  const result = await cliInvoke(root, ["--mode", "dev"]);
  expect(result.kind).toBe("ok");
  expect(result.stdout.trim()).toBe("dev");
});

test("cliValidateRoot rejects Enum with no choices", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    handler: () => {},
    options: [{ name: "mode", description: "", kind: CliOptionKind.Enum, choices: [] }],
  };
  expect(() => cliValidateRoot(root)).toThrow(/requires non-empty choices/);
});

test("cliValidateRoot rejects Enum with duplicate choices", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    handler: () => {},
    options: [{ name: "mode", description: "", kind: CliOptionKind.Enum, choices: ["a", "a"] }],
  };
  expect(() => cliValidateRoot(root)).toThrow(/choices must be distinct/);
});

test("mcpTool.description override wins without requiresEnv suffix", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    mcpServer: {},
    commands: [
      {
        key: "x",
        description: "Leaf desc.",
        mcpTool: { description: "custom", requiresEnv: ["TOKEN"] },
        handler: () => {},
      },
    ],
  };
  const tools = collectMcpTools(root);
  expect(tools[0]!.description).toBe("custom");
});

test("mcpTool.requiresEnv appended to auto description", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    mcpServer: {},
    commands: [
      {
        key: "x",
        description: "Leaf desc.",
        mcpTool: { requiresEnv: ["TOKEN"] },
        handler: () => {},
      },
    ],
  };
  const tools = collectMcpTools(root);
  expect(tools[0]!.description).toContain("[requires env: TOKEN]");
});

test("cliValidateRoot rejects duplicate mcpResources URIs", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    mcpServer: {
      resources: [
        { uri: "a://1", name: "a", load: () => "a" },
        { uri: "a://1", name: "b", load: () => "b" },
      ],
    },
    commands: [{ key: "x", description: "", handler: () => {} }],
  };
  expect(() => cliValidateRoot(root)).toThrow(/URIs must be unique/);
});

test("cliValidateRoot rejects resource URI matching schemaResourceUri", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    mcpServer: {
      schemaResourceUri: "custom://schema",
      resources: [{ uri: "custom://schema", name: "dup", load: () => "" }],
    },
    commands: [{ key: "x", description: "", handler: () => {} }],
  };
  expect(() => cliValidateRoot(root)).toThrow(/conflicts with the built-in schema resource/);
});

test("allMcpResources includes custom resources", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    mcpServer: {
      resources: [{ uri: "test://x", name: "x", load: () => "body" }],
    },
    commands: [{ key: "leaf", description: "", handler: () => {} }],
  };
  const resources = allMcpResources(root);
  expect(resources.map((r) => r.uri)).toContain("argsbarg://schema");
  expect(resources.map((r) => r.uri)).toContain("test://x");
});

test("applyShellEnv merges PATH and preserves host vars", () => {
  const origPath = process.env.PATH ?? "";
  const origHome = process.env.HOME;
  process.env.PATH = "/host/bin";
  process.env.HOME = "host-home";
  applyShellEnv({ PATH: "/shell/bin:/host/bin", HOME: "shell-home", NEWVAR: "yes" });
  expect(process.env.PATH?.startsWith("/shell/bin:")).toBe(true);
  expect(process.env.PATH).toContain("/host/bin");
  expect(process.env.HOME).toBe("host-home");
  expect(process.env.NEWVAR).toBe("yes");
  process.env.PATH = origPath;
  if (origHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = origHome;
  }
  delete process.env.NEWVAR;
});

test("loadEnvFile overwrites existing keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "argsbarg-env-"));
  const file = join(dir, ".env");
  writeFileSync(file, "FOO=fromfile\n", "utf8");
  process.env.FOO = "original";
  loadEnvFile(file);
  expect(process.env.FOO).toBe("fromfile");
  delete process.env.FOO;
});

test("Enum completions list choices in bash script", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "run",
        description: "",
        options: [
          { name: "mode", description: "m", kind: CliOptionKind.Enum, choices: ["dev", "prod"] },
        ],
        handler: () => {},
      },
    ],
  };
  const bash = completionBashScript(root);
  expect(bash).toContain("--mode) COMPREPLY=");
  expect(bash).toContain("dev");
  expect(bash).toContain("prod");
});

test("MCP resources/list includes custom resource", async () => {
  const responses = await mcpRequest(
    [{ jsonrpc: "2.0", id: 10, method: "resources/list", params: {} }],
    { script: "examples/mcp-test.ts" },
  );
  const res = responses.get(10) as { result: { resources: { uri: string }[] } };
  const uris = res.result.resources.map((r) => r.uri);
  expect(uris).toContain("argsbarg://schema");
  expect(uris).toContain("test://hello");
});

test("MCP resources/read returns custom resource body", async () => {
  const responses = await mcpRequest(
    [{ jsonrpc: "2.0", id: 11, method: "resources/read", params: { uri: "test://hello" } }],
    { script: "examples/mcp-test.ts" },
  );
  const res = responses.get(11) as { result: { contents: { text: string }[] } };
  expect(res.result.contents[0]!.text).toBe("hello resource");
});

test("MCP resources/read unknown URI returns error", async () => {
  const responses = await mcpRequest(
    [{ jsonrpc: "2.0", id: 12, method: "resources/read", params: { uri: "missing://nope" } }],
    { script: "examples/mcp-test.ts" },
  );
  const res = responses.get(12) as { error: { code: number } };
  expect(res.error.code).toBe(-32602);
});

test("MCP requiresEnv fails when env missing", async () => {
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
  expect(res.result.content[0]!.text).toContain("ARGS_TEST_SECRET");
});

test("MCP requiresEnv succeeds when env present", async () => {
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
  expect(res.result.content[0]!.text.trim()).toBe("sekrit");
});

test("MCP envFile loads vars for tool handlers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "argsbarg-mcp-"));
  const envFile = join(dir, "mcp.env");
  writeFileSync(envFile, "ARGS_FILE_TOKEN=file-value\n", "utf8");
  const responses = await mcpRequest(
    [
      {
        jsonrpc: "2.0",
        id: 15,
        method: "tools/call",
        params: { name: "echo_env", arguments: { name: "ARGS_FILE_TOKEN" } },
      },
    ],
    { script: "examples/mcp-test.ts", env: { ARGS_TEST_ENV_FILE: envFile, ARGS_TEST_SECRET: "present" } },
  );
  const res = responses.get(15) as { result: { isError: boolean; content: { text: string }[] } };
  expect(res.result.isError).toBe(false);
  expect(res.result.content[0]!.text.trim()).toBe("file-value");
});

// ── v1.3 parser ergonomics ────────────────────────────────────────────────────

function varargsReadFixture(): CliCommand {
  return {
    key: "app",
    description: "",
    commands: [
      {
        key: "read",
        description: "Read files.",
        options: [
          {
            name: "json",
            description: "",
            kind: CliOptionKind.Presence,
          },
        ],
        positionals: [
          {
            name: "files",
            description: "",
            kind: CliOptionKind.String,
            argMin: 0,
            argMax: 0,
          },
        ],
        handler: () => {},
      },
    ],
  };
}

function nestedDocsFallbackFixture(): CliCommand {
  return {
    key: "app",
    description: "",
    commands: [
      {
        key: "docs",
        description: "Documentation commands.",
        fallbackCommand: "guide",
        fallbackMode: CliFallbackMode.MissingOnly,
        commands: [
          {
            key: "guide",
            description: "User guide.",
            handler: () => {},
          },
          {
            key: "api",
            description: "API reference.",
            handler: () => {},
          },
        ],
      },
    ],
  };
}

test("nested fallback routes to default when argv exhausted at router", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["docs"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.path).toEqual(["docs", "guide"]);
});

test("nested fallback MissingOrUnknown routes unknown token to default", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "docs",
        description: "Documentation commands.",
        fallbackCommand: "guide",
        fallbackMode: CliFallbackMode.MissingOrUnknown,
        commands: [
          {
            key: "guide",
            description: "User guide.",
            positionals: [
              {
                name: "topic",
                description: "",
                kind: CliOptionKind.String,
                argMin: 0,
                argMax: 0,
              },
            ],
            handler: () => {},
          },
          {
            key: "api",
            description: "API reference.",
            handler: () => {},
          },
        ],
      },
    ],
  };
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["docs", "extra-topic"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.path).toEqual(["docs", "guide"]);
  expect(pr.args).toEqual(["extra-topic"]);
});

test("nested fallback MissingOnly errors on unknown subcommand", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateRoot(root);
  const pr = parse(root, ["docs", "nope"]);
  expect(pr.kind).toBe(ParseKind.Error);
  expect(pr.errorMsg).toContain("Unknown subcommand");
});

test("cliValidateRoot rejects invalid nested fallbackCommand", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "docs",
        description: "",
        fallbackCommand: "missing",
        commands: [
          {
            key: "guide",
            description: "",
            handler: () => {},
          },
        ],
      },
    ],
  };
  expect(() => cliValidateRoot(root)).toThrow(/fallbackCommand 'missing' is not a child of 'docs'/);
});

test("cliValidateRoot accepts nested fallbackCommand when child exists", () => {
  const root = nestedDocsFallbackFixture();
  expect(() => cliValidateRoot(root)).not.toThrow();
});

test("nested router scoped help does not route to fallback", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateRoot(root);
  const pr = parse(root, ["docs", "--help"]);
  expect(pr.kind).toBe(ParseKind.Help);
  expect(pr.helpPath).toEqual(["docs"]);
  expect(pr.helpExplicit).toBe(true);
  const help = cliHelpRender(root, pr.helpPath, false);
  expect(help).toContain("api");
  expect(help).toContain("guide");
});

test("varargs trailing option after positionals via cliInvoke", async () => {
  const root = varargsReadFixture();
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["read", "file.txt", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["file.txt"]);
  expect(pr.opts["json"]).toBe("1");
});

test("varargs option before positionals", () => {
  const root = varargsReadFixture();
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["read", "--json", "file.txt"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["file.txt"]);
  expect(pr.opts["json"]).toBe("1");
});

test("varargs multiple files then trailing option", () => {
  const root = varargsReadFixture();
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["read", "a.txt", "b.txt", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["a.txt", "b.txt"]);
  expect(pr.opts["json"]).toBe("1");
});

test("varargs double dash forces positional", () => {
  const root = varargsReadFixture();
  cliValidateRoot(root);
  const pr = postParseValidate(root, parse(root, ["read", "file.txt", "--", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["file.txt", "--json"]);
  expect(pr.opts["json"]).toBeUndefined();
});

test("varargs unknown flag errors", async () => {
  const root = varargsReadFixture();
  cliValidateRoot(root);
  const result = await cliInvoke(root, ["read", "--unknown"]);
  expect(result.kind).toBe("error");
  expect(result.stderr).toContain("--unknown");
});

test("varargs scoped help in tail", () => {
  const root = varargsReadFixture();
  cliValidateRoot(root);
  const pr = parse(root, ["read", "file.txt", "--help"]);
  expect(pr.kind).toBe(ParseKind.Help);
  expect(pr.helpPath).toContain("read");
  expect(pr.helpExplicit).toBe(true);
});

test("ctx.positional returns single slot value", async () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        positionals: [{ name: "path", description: "", kind: CliOptionKind.String }],
        handler: (ctx) => {
          captured = ctx.positional("path");
        },
      },
    ],
  };
  let captured: string | string[] | undefined;
  cliValidateRoot(root);
  await cliInvoke(root, ["x", "./file"]);
  expect(captured).toBe("./file");
});

test("ctx.positional returns varargs array", async () => {
  const root = varargsReadFixture();
  let captured: string | string[] | undefined;
  root.commands![0]!.handler = (ctx) => {
    captured = ctx.positional("files");
  };
  cliValidateRoot(root);
  await cliInvoke(root, ["read", "a.txt", "b.txt"]);
  expect(captured).toEqual(["a.txt", "b.txt"]);
});

test("ctx.positional returns undefined for absent optional slot", async () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        positionals: [
          { name: "opt", description: "", kind: CliOptionKind.String, argMin: 0, argMax: 1 },
        ],
        handler: (ctx) => {
          captured = ctx.positional("opt");
        },
      },
    ],
  };
  let captured: string | string[] | undefined;
  cliValidateRoot(root);
  await cliInvoke(root, ["x"]);
  expect(captured).toBeUndefined();
});

test("ctx.positional varargs matches ctx.args", async () => {
  const root = varargsReadFixture();
  let positional: string | string[] | undefined;
  let args: string[] = [];
  root.commands![0]!.handler = (ctx) => {
    positional = ctx.positional("files");
    args = ctx.args;
  };
  cliValidateRoot(root);
  await cliInvoke(root, ["read", "a.txt", "b.txt"]);
  expect(positional).toEqual(args);
});

test("mcpToolCallToArgv coerces comma-separated string for varargs", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: "a,b" });
  expect(argv).toEqual(["read", "a", "b"]);
});

test("mcpToolCallToArgv coerces single string for varargs", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: "a" });
  expect(argv).toEqual(["read", "a"]);
});

test("mcpToolCallToArgv array varargs unchanged", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: ["a", "b"] });
  expect(argv).toEqual(["read", "a", "b"]);
});

test("mcpToolCallToArgv empty string varargs appends nothing", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: "" });
  expect(argv).toEqual(["read"]);
});

// ── AI builtins and skills ────────────────────────────────────────────────────

test("aiSkill on non-root node is rejected", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        aiSkill: { enabled: false },
        handler: () => {},
      },
    ],
  };
  expect(() => cliValidateRoot(root)).toThrow(/aiSkill is only supported on the program root/);
});

test("generateSkillBundle includes frontmatter and command catalog", () => {
  const bundle = generateSkillBundle(nestedMcpFixture, "cursor");
  expect(bundle.dirName).toBe("nested_ts");
  expect(bundle.skillMd).toMatch(/^---\nname: nested_ts\n/);
  expect(bundle.skillMd).toContain("stat owner lookup");
  expect(bundle.skillMd).toContain("ai mcp");
  expect(bundle.referenceMd).toContain("```json");
  expect(() => JSON.parse(bundle.referenceMd.match(/```json\n([\s\S]*?)\n```/)![1]!)).not.toThrow();
});

test("cliSkillInstall writes project Cursor skill files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "argsbarg-skill-"));
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const msg = cliSkillInstall(nestedMcpFixture, "cursor", { force: true });
    expect(msg).toContain(".cursor/skills/nested_ts/");
    const skillDir = join(cwd, ".cursor", "skills", "nested_ts");
    expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(skillDir, "reference.md"))).toBe(true);
    expect(readFileSync(join(skillDir, "SKILL.md"), "utf8")).toContain("stat owner lookup");
  } finally {
    process.chdir(prev);
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cliSkillInstall global uses HOME skills directory", () => {
  const home = mkdtempSync(join(tmpdir(), "argsbarg-home-"));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const msg = cliSkillInstall(nestedMcpFixture, "cursor", { global: true, force: true });
    expect(msg).toContain(join(home, ".cursor", "skills", "nested_ts"));
    expect(existsSync(join(home, ".cursor", "skills", "nested_ts", "SKILL.md"))).toBe(true);
  } finally {
    if (prevHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = prevHome;
    }
    rmSync(home, { recursive: true, force: true });
  }
});

test("cliSkillInstall fails when directory exists without force", () => {
  const cwd = mkdtempSync(join(tmpdir(), "argsbarg-skill-dup-"));
  const prev = process.cwd();
  process.chdir(cwd);
  const prevExit = process.exit;
  let exitCode = 0;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error("exit");
  }) as typeof process.exit;
  try {
    cliSkillInstall(nestedMcpFixture, "cursor", { force: true });
    try {
      cliSkillInstall(nestedMcpFixture, "cursor", {});
    } catch {
      // expected exit throw
    }
    expect(exitCode).toBe(1);
  } finally {
    process.exit = prevExit;
    process.chdir(prev);
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cliSkillInstall claude target uses .claude/skills", () => {
  const cwd = mkdtempSync(join(tmpdir(), "argsbarg-skill-claude-"));
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const msg = cliSkillInstall(nestedMcpFixture, "claude", { force: true });
    expect(msg).toContain(".claude/skills/nested_ts/");
    expect(readFileSync(join(cwd, ".claude", "skills", "nested_ts", "SKILL.md"), "utf8")).toContain(
      "Claude Code",
    );
  } finally {
    process.chdir(prev);
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ai skill cursor fails when aiSkill disabled", async () => {
  const dir = mkdtempSync(join(tmpdir(), "argsbarg-skill-off-"));
  const script = join(dir, "skill-off.ts");
  writeFileSync(
    script,
    `import { cliRun, CliCommand } from ${JSON.stringify(join(import.meta.dir, "index.ts"))};
const cli: CliCommand = {
  key: "offapp",
  description: "demo",
  aiSkill: { enabled: false },
  commands: [{ key: "x", description: "x", handler: () => {} }],
};
await cliRun(cli);
`,
    "utf8",
  );
  const { stderr, exitCode } = await $`bun run ${script} ai skill cursor`.nothrow().quiet();
  expect(exitCode).toBe(1);
  expect(stderr.toString()).toContain("AI skills are disabled");
});