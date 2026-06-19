/*
This test file covers parsing, validation, and completion regressions.
It exercises the public API rather than internal helpers so the tests follow the same
paths that users and example CLIs take.

It keeps the CLI contract stable by catching routing, option handling, and generated
shell output regressions.
*/

import { completionBashScript, completionZshScript } from "./completion.ts";
import { cliHelpRender } from "./help.ts";
import { CliCommand, CliFallbackMode, CliOptionKind } from "./index.ts";
import {
  collectMcpTools,
  mcpToolCallToArgv,
  mcpToolDescription,
  sanitizeToolSegment,
} from "./mcp/tools.ts";
import { buildToolCallSuccess } from "./mcp/result.ts";
import { ParseKind, parse, postParseValidate } from "./parse.ts";
import { cliSchemaJson } from "./schema.ts";
import { cliValidateRoot } from "./validate.ts";
import { expect, test } from "bun:test";
import { $ } from "bun";
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

test("varargs tail does not parse trailing options", () => {
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
  expect(pr.args).toEqual(["./file", "--json"]);
  expect(pr.opts["json"]).toBeUndefined();
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
async function mcpRequest(requests: object[]): Promise<Map<string | number, object>> {
  const proc = Bun.spawn(["bun", "run", "examples/nested.ts", "mcp"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
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
  expect(names).not.toContain("mcp");
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

test("reserved command name mcp is rejected", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    commands: [
      {
        key: "mcp",
        description: "bad",
        handler: () => {},
      },
    ],
  };
  expect(() => cliValidateRoot(root)).toThrow(/Reserved command name: mcp/);
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

test("minimal.ts mcp without opt-in fails", async () => {
  const { stderr, exitCode } = await $`bun run examples/minimal.ts mcp`.nothrow().quiet();
  expect(exitCode).toBe(1);
  expect(stderr.toString()).toContain("mcp");
});