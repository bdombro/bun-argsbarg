/*
Domain-specific regression tests (split from index.test.ts).
*/

import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { completionBashScript, completionZshScript } from "./builtins/index.ts";
import { cliPresentationRoot } from "./builtins/presentation.ts";
import { cliHelpRender } from "./help.ts";
import { Cli, CliFallbackMode, CliOptionKind, type CliProgram } from "./index.ts";
import { applyShellEnv } from "./mcp/env.ts";
import {
  allMcpResources,
  collectMcpTools,
  mcpToolCallToArgv,
  resolveMcpSchemaUri,
} from "./mcp/tools.ts";
import { ParseKind, parse, postParseValidate } from "./parse.ts";
import { cliSchemaJson } from "./schema.ts";
import { generatePluginSkillBundle, generateSkillBundle } from "./skill/generate.ts";
import { cliSkillInstall } from "./skill/install.ts";
import {
  enumMcpFixture,
  nestedDocsFallbackFixture,
  nestedMcpFixture,
  testProgram,
  varargsReadFixture,
} from "./test-fixtures.ts";
import { cliValidateProgram } from "./validate.ts";

test("bundled short presence flags", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "-ab"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.opts.a).toBe("1");
  expect(pr.opts.b).toBe("1");
});

test("long option equals", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "--name=pat"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.opts.name).toBe("pat");
});

test("fallback missing or unknown root flags", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["--name", "bob"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.path).toEqual(["hello"]);
  expect(pr.opts.name).toBe("bob");
});

test("unknown command", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [{ key: "hello", description: "", handler: () => {} }],
  });
  cliValidateProgram(root);
  const pr = parse(root, ["nope"]);
  expect(pr.kind).toBe(ParseKind.Error);
  expect(pr.errorMsg).toContain("Unknown command");
});

test("implicit help empty", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [{ key: "x", description: "", handler: () => {} }],
  });
  cliValidateProgram(root);
  const pr = parse(root, []);
  expect(pr.kind).toBe(ParseKind.Help);
  expect(pr.helpExplicit).toBe(false);
});

test("invalid number post validate", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  let pr = parse(root, ["x", "--n", "notnum"]);
  pr = postParseValidate(root, pr);
  expect(pr.kind).toBe(ParseKind.Error);
  expect(pr.errorMsg).toContain("Invalid number");
});

test("supports scientific notation in numbers", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  let pr = parse(root, ["x", "--n", "1.23e4"]);
  pr = postParseValidate(root, pr);
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(Number(pr.opts.n)).toBe(12300);
});

test("completion scripts contain app name", () => {
  const root = testProgram({
    key: "myapp",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  });
  cliValidateProgram(root);
  const bash = completionBashScript(cliPresentationRoot(root));
  expect(bash).toContain("bash completion for myapp");
  expect(bash).toContain("complete -F _myapp myapp");

  const zsh = completionZshScript(cliPresentationRoot(root));
  expect(zsh).toContain("#compdef myapp");
  expect(zsh).toContain("compdef _myapp myapp");
  expect(zsh).toContain("hello:Say hello.");
});

test("completion scripts do not emit invalid bash substitutions", () => {
  const root = testProgram({
    key: "app",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  });
  cliValidateProgram(root);
  const bash = completionBashScript(cliPresentationRoot(root));
  expect(bash).not.toContain("${${");
});

test("completion scripts escape shell-sensitive command text in zsh", () => {
  const root = testProgram({
    key: "app",
    description: "Test",
    commands: [
      {
        key: "quote'cmd",
        description: "Say 'hello' and keep going.",
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  const zsh = completionZshScript(cliPresentationRoot(root));
  expect(zsh).toContain("quote'\\''cmd:Say '\\''hello'\\'' and keep going.");
});

test("completion scripts keep dotted app names in registration names", () => {
  const root = testProgram({
    key: "minimal.ts",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  });
  cliValidateProgram(root);

  const bash = completionBashScript(cliPresentationRoot(root));
  expect(bash).toContain("complete -F _minimal_ts minimal.ts");

  const zsh = completionZshScript(cliPresentationRoot(root));
  expect(zsh).toContain("compdef _minimal_ts minimal.ts");
});

test("trailing options after bounded positionals", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "./file", "--verbose"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["./file"]);
  expect(pr.opts.verbose).toBe("1");
});

test("trailing options include parent-scoped flags", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(
    root,
    parse(root, ["group", "leaf", "-u", "alice", "./file", "--json"]),
  );
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.path).toEqual(["group", "leaf"]);
  expect(pr.args).toEqual(["./file"]);
  expect(pr.opts.user).toBe("alice");
  expect(pr.opts.json).toBe("1");
});

test("varargs tail parses trailing options", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "./file", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["./file"]);
  expect(pr.opts.json).toBe("1");
});

test("stops parsing options at --", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(
    root,
    parse(root, ["x", "--name", "pat", "--", "--name", "bob", "-x"]),
  );
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.opts.name).toBe("pat");
  expect(pr.args).toEqual(["--name", "bob", "-x"]);
});

test("missing required option returns error", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x"]));
  expect(pr.kind).toBe(ParseKind.Error);
  expect(pr.errorMsg).toContain("Missing required option: --req");
});

test("provided required option parses ok", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "--req", "val"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.opts.req).toBe("val");
});

test("presence option cannot be required", () => {
  const root = testProgram({
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
  });
  expect(() => cliValidateProgram(root)).toThrow(/Presence option cannot be required/);
});

test("leaf completion help prints correctly", async () => {
  // Test the fix where `completion zsh -h` on a leaf root was incorrectly ignored.
  // We run this as a subprocess so we don't accidentally exit the test runner.
  const { stdout, stderr, exitCode } = await $`bun run examples/minimal.ts completion zsh -h`
    .nothrow()
    .quiet();
  const out = stdout.toString();
  expect(exitCode).toBe(0);
  expect(out).toContain("Show help for this command.");
  expect(out).toContain("Manual install:");
  expect(stderr.toString()).toBe("");
});

test("docs schema exports JSON for nested CLIs", async () => {
  const { stdout, stderr, exitCode } = await $`bun run examples/nested.ts docs schema`
    .nothrow()
    .quiet();
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

test("docs schema exports JSON for leaf roots", async () => {
  const { stdout, exitCode } = await $`bun run examples/minimal.ts docs schema`.nothrow().quiet();
  expect(exitCode).toBe(0);

  const schema = JSON.parse(stdout.toString());
  expect(schema.key).toBe("minimal.ts");
  expect(schema.positionals[0].name).toBe("name");
  expect(schema.options[0].name).toBe("verbose");
  expect(schema.commands.map((c: { key: string }) => c.key)).toEqual([
    "completion",
    "version",
    "install",
    "docs",
  ]);
});

test("version builtin prints program version", async () => {
  const { stdout, exitCode } = await $`bun run examples/nested.ts version`.nothrow().quiet();
  expect(exitCode).toBe(0);
  expect(stdout.toString().trim()).toMatch(/^\d+\.\d+\.\d+/);
});

test("leaf root help lists completion built-in", async () => {
  const { stdout, exitCode } = await $`bun run examples/minimal.ts -h`.nothrow().quiet();
  expect(exitCode).toBe(0);
  expect(stdout.toString()).toContain("completion");
  expect(stdout.toString()).toContain("Generate the autocompletion script for shells.");
});

test("root --schema is no longer a flag", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "demo",
    docs: {
      enabled: true,
      topics: { readme: { text: "# readme\n" } },
    },
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  const pr = parse(cliPresentationRoot(root), ["--schema"]);
  expect(pr.kind).not.toBe(ParseKind.Ok);
});

test("cliSchemaJson omits handlers and completion built-ins", () => {
  const root = testProgram({
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
  });

  const schema = JSON.parse(cliSchemaJson(root));
  expect(schema.commands).toHaveLength(1);
  expect(schema.commands[0].key).toBe("x");
  expect(schema).not.toHaveProperty("handler");
});

test("cliSchemaExport resolves program key in install notes", () => {
  const root = testProgram({
    key: "myapp",
    version: "1.0.0",
    description: "demo",
    commands: [
      {
        key: "run",
        description: "run",
        handler: () => {},
      },
    ],
  });

  const json = cliSchemaJson(root);
  expect(json).not.toContain("{argsbarg:program}");
  expect(json).toContain("myapp install --yes");
});

test("cliSchemaExport resolves {argsbarg:program} in consumer notes", () => {
  const root = testProgram({
    key: "myapp",
    version: "1.0.0",
    description: "demo",
    commands: [
      {
        key: "run",
        description: "run",
        notes: "Run `{argsbarg:program} run` to start.",
        handler: () => {},
      },
    ],
  });

  const schema = JSON.parse(cliSchemaJson(root));
  expect(schema.commands[0].notes).toBe("Run `myapp run` to start.");
});

test("docs help lists schema, api, and skill subcommands", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "demo",
    docs: {
      enabled: true,
      topics: { readme: { text: "# readme\n" } },
    },
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
    ],
  });
  const help = cliHelpRender(cliPresentationRoot(root), ["docs"], false);
  expect(help).toContain("schema");
  expect(help).toContain("Print the full command tree as JSON.");
  expect(help).toContain("api");
  expect(help).toContain("markdown");
  expect(help).toContain("skill");
  expect(help).toContain("reference agent SKILL");
});

test("root help omits legacy --schema flag", () => {
  const root = testProgram({
    key: "app",
    version: "1.0.0",
    description: "demo",
    commands: [
      {
        key: "x",
        description: "cmd",
        handler: () => {},
      },
    ],
  });
  const help = cliHelpRender(cliPresentationRoot(root), [], false);
  expect(help).not.toContain("--schema");
});

test("root help shows agent docs hint when docs enabled", () => {
  const root = testProgram({
    key: "myapp",
    version: "1.0.0",
    description: "demo",
    docs: {
      enabled: true,
      topics: { readme: { text: "# readme\n" } },
    },
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  });
  const help = cliHelpRender(cliPresentationRoot(root), [], false);
  expect(help).toContain("For AI agents: `myapp docs skill`.");
  expect(help).not.toContain("install --skill");
});

test("root help omits agent hint when docs disabled", () => {
  const root = testProgram({
    key: "myapp",
    version: "1.0.0",
    description: "demo",
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  });
  const help = cliHelpRender(cliPresentationRoot(root), [], false);
  expect(help).not.toContain("Agents:");
  expect(help).not.toContain("docs skill");
});

test("root help includes program notes and agent hint", () => {
  const root = testProgram({
    key: "myapp",
    version: "1.0.0",
    description: "demo",
    notes: "See `{argsbarg:program} docs readme` for the user guide.",
    docs: {
      enabled: true,
      topics: { readme: { text: "# readme\n" } },
    },
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  });
  const help = cliHelpRender(cliPresentationRoot(root), [], false);
  expect(help).toContain("See `myapp docs readme` for the user guide.");
  expect(help).toContain("myapp docs skill");
});

test("Enum option inputSchema includes enum array", () => {
  const tools = collectMcpTools(enumMcpFixture);
  const run = tools.find((t) => t.name === "run")!;
  const schema = run.inputSchema as { properties: { mode: { enum?: string[] } } };
  expect(schema.properties.mode.enum).toEqual(["dev", "prod"]);
});

test("cliValidateProgram rejects Enum with no choices", () => {
  const root = testProgram({
    key: "app",
    description: "",
    handler: () => {},
    options: [{ name: "mode", description: "", kind: CliOptionKind.Enum, choices: [] }],
  });
  expect(() => cliValidateProgram(root)).toThrow(/requires non-empty choices/);
});

test("cliValidateProgram rejects Enum with duplicate choices", () => {
  const root = testProgram({
    key: "app",
    description: "",
    handler: () => {},
    options: [{ name: "mode", description: "", kind: CliOptionKind.Enum, choices: ["a", "a"] }],
  });
  expect(() => cliValidateProgram(root)).toThrow(/choices must be distinct/);
});

test("mcpTool.description override wins without env suffix", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: { enabled: true },
    commands: [
      {
        key: "x",
        description: "Leaf desc.",
        mcpTool: { description: "custom" },
        handler: () => {},
      },
    ],
  });
  const tools = collectMcpTools(root);
  expect(tools[0]?.description).toBe("custom");
});

test("cliValidateProgram requires program.appConfig description", () => {
  const root = testProgram({
    key: "app",
    description: "",
    appConfig: { entries: { token: {} as { description: string } } },
    handler: () => {},
  });
  expect(() => cliValidateProgram(root)).toThrow(/description must be a non-empty string/);
});

test("cliValidateProgram rejects duplicate mcpResources URIs", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: {
      enabled: true,
      resources: [
        { uri: "a://1", name: "a", load: () => "a" },
        { uri: "a://1", name: "b", load: () => "b" },
      ],
    },
    commands: [{ key: "x", description: "", handler: () => {} }],
  });
  expect(() => cliValidateProgram(root)).toThrow(/URIs must be unique/);
});

test("cliValidateProgram rejects empty mcpServer", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: {} as { enabled: boolean },
    handler: () => {},
  });
  expect(() => cliValidateProgram(root)).toThrow(/mcpServer requires enabled: true/);
});

test("resolveMcpSchemaUri uses sanitized root key", () => {
  const root = testProgram({
    key: "nested.ts",
    description: "",
    mcpServer: { enabled: true },
    handler: () => {},
  });
  expect(resolveMcpSchemaUri(root)).toBe("nested_ts://schema");
});

test("resolveMcpSchemaUri uses plain key when alphanumeric", () => {
  const root = testProgram({
    key: "qa",
    description: "",
    mcpServer: { enabled: true },
    handler: () => {},
  });
  expect(resolveMcpSchemaUri(root)).toBe("qa://schema");
});

test("cliValidateProgram rejects resource URI matching default schema URI", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: {
      enabled: true,
      resources: [{ uri: "app://schema", name: "dup", load: () => "" }],
    },
    commands: [{ key: "x", description: "", handler: () => {} }],
  });
  expect(() => cliValidateProgram(root)).toThrow(/conflicts with built-in schema resource/);
});

test("cliValidateProgram rejects resource URI matching schemaResourceUri", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: {
      enabled: true,
      schemaResourceUri: "custom://schema",
      resources: [{ uri: "custom://schema", name: "dup", load: () => "" }],
    },
    commands: [{ key: "x", description: "", handler: () => {} }],
  });
  expect(() => cliValidateProgram(root)).toThrow(/conflicts with built-in schema resource/);
});

test("cliValidateProgram rejects resource URI matching auto docs topic", () => {
  const root = testProgram({
    key: "app",
    description: "",
    docs: { enabled: true, topics: { readme: { text: "# r\n" } } },
    mcpServer: {
      enabled: true,
      resources: [{ uri: "app://docs/readme", name: "dup", load: () => "" }],
    },
    commands: [{ key: "x", description: "", handler: () => {} }],
  });
  expect(() => cliValidateProgram(root)).toThrow(/conflicts with auto docs topic resource/);
});

test("allMcpResources includes custom resources", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: {
      enabled: true,
      resources: [{ uri: "test://x", name: "x", load: () => "body" }],
    },
    commands: [{ key: "leaf", description: "", handler: () => {} }],
  });
  const resources = allMcpResources(root);
  expect(resources.map((r) => r.uri)).toContain("app://schema");
  expect(resources.map((r) => r.uri)).toContain("test://x");
});

test("allMcpResources includes docs topic resources", () => {
  const root = testProgram({
    key: "app",
    description: "",
    docs: { enabled: true, topics: { readme: { text: "# hi\n" } } },
    mcpServer: { enabled: true },
    commands: [{ key: "leaf", description: "", handler: () => {} }],
  });
  const resources = allMcpResources(root);
  expect(resources.map((r) => r.uri)).toContain("app://docs/readme");
  const readme = resources.find((r) => r.uri === "app://docs/readme");
  expect(readme?.load()).toBe("# hi\n");
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

test("Enum completions list choices in bash script", () => {
  const root = testProgram({
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
  });
  const bash = completionBashScript(cliPresentationRoot(root));
  expect(bash).toContain("--mode) COMPREPLY=");
  expect(bash).toContain("dev");
  expect(bash).toContain("prod");
});

test("nested fallback routes to default when argv exhausted at router", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["docs"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.path).toEqual(["docs", "guide"]);
});

test("nested fallback MissingOrUnknown routes unknown token to default", () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["docs", "extra-topic"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.path).toEqual(["docs", "guide"]);
  expect(pr.args).toEqual(["extra-topic"]);
});

test("nested fallback MissingOnly errors on unknown subcommand", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateProgram(root);
  const pr = parse(root, ["docs", "nope"]);
  expect(pr.kind).toBe(ParseKind.Error);
  expect(pr.errorMsg).toContain("Unknown subcommand");
});

test("cliValidateProgram rejects invalid nested fallbackCommand", () => {
  const root = testProgram({
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
  });
  expect(() => cliValidateProgram(root)).toThrow(
    /fallbackCommand 'missing' is not a child of 'docs'/,
  );
});

test("cliValidateProgram accepts nested fallbackCommand when child exists", () => {
  const root = nestedDocsFallbackFixture();
  expect(() => cliValidateProgram(root)).not.toThrow();
});

test("nested router scoped help does not route to fallback", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateProgram(root);
  const pr = parse(root, ["docs", "--help"]);
  expect(pr.kind).toBe(ParseKind.Help);
  expect(pr.helpPath).toEqual(["docs"]);
  expect(pr.helpExplicit).toBe(true);
  const help = cliHelpRender(cliPresentationRoot(root), pr.helpPath, false);
  expect(help).toContain("api");
  expect(help).toContain("guide");
});

test("varargs trailing option after positionals via Cli.invoke", async () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["read", "file.txt", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["file.txt"]);
  expect(pr.opts.json).toBe("1");
});

test("varargs option before positionals", () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["read", "--json", "file.txt"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["file.txt"]);
  expect(pr.opts.json).toBe("1");
});

test("varargs multiple files then trailing option", () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["read", "a.txt", "b.txt", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["a.txt", "b.txt"]);
  expect(pr.opts.json).toBe("1");
});

test("varargs double dash forces positional", () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["read", "file.txt", "--", "--json"]));
  expect(pr.kind).toBe(ParseKind.Ok);
  expect(pr.args).toEqual(["file.txt", "--json"]);
  expect(pr.opts.json).toBeUndefined();
});

test("varargs unknown flag errors", async () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const result = await new Cli(root).invoke(["read", "--unknown"]);
  expect(result.kind).toBe("error");
  expect(result.stderr).toContain("--unknown");
});

test("mcpToolCallToArgv rejects comma-separated string for varargs", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: "a,b" });
  expect(argv).toEqual({ error: expect.stringContaining("JSON array") });
});

test("mcpToolCallToArgv rejects bare string for varargs", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: "a" });
  expect(argv).toEqual({ error: expect.stringContaining("JSON array") });
});

test("mcpToolCallToArgv array varargs unchanged", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: ["a", "b"] });
  expect(argv).toEqual(["read", "a", "b"]);
});

test("mcpToolCallToArgv empty array varargs errors when required", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = tools.find((t) => t.name === "read")!;
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: [] });
  expect(argv).toEqual({ error: "Missing argument: files" });
});

// ── Skills ────────────────────────────────────────────────────────────────────

test("install config on non-root node is rejected", () => {
  const root = {
    key: "app",
    version: "0.0.0",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        install: { enabled: false },
        handler: () => {},
      },
    ],
  } as unknown as CliProgram;
  expect(() => cliValidateProgram(root)).toThrow(/install is only supported on the program root/);
});

test("install.prefix is rejected", () => {
  const root = {
    key: "app",
    version: "0.0.0",
    description: "",
    install: { prefix: "/opt/bin" },
    handler: () => {},
  } as unknown as CliProgram;
  expect(() => cliValidateProgram(root)).toThrow(/install\.prefix removed/);
});

test("generateSkillBundle includes frontmatter and compact command index", () => {
  const bundle = generateSkillBundle(nestedMcpFixture, "cursor");
  expect(bundle.dirName).toBe("nested_ts");
  expect(bundle.skillMd).toMatch(/^---\nname: nested_ts\n/);
  expect(bundle.skillMd).toContain("## Commands");
  expect(bundle.skillMd).toContain("`nested.ts stat owner lookup <path>`");
  expect(bundle.skillMd).toContain("Invoke via shell:");
  expect(bundle.skillMd).toContain("For full detail, open `reference.md`");
  expect(bundle.skillMd).not.toContain("#### Options");
  expect(bundle.skillMd).not.toContain("CLI API reference");
  expect(bundle.skillMd).not.toContain("mcp.json");
  expect(bundle.skillMd).not.toContain("Prefer MCP");
  expect(bundle.skillMd).not.toContain("tools/call");
  expect(bundle.skillMd).not.toContain("Generated by");
  expect(bundle.referenceMd).toContain("CLI API reference");
  expect(bundle.referenceMd).toContain("#### Options");
  expect(bundle.referenceMd).not.toContain("Generated by");
  expect(bundle.referenceMd).not.toContain("```json");
});

test("generatePluginSkillBundle is MCP routing stub without shell catalog", () => {
  const bundle = generatePluginSkillBundle(nestedMcpFixture);
  expect(bundle.dirName).toBe("nested_ts");
  expect(bundle.skillMd).toMatch(/^---\nname: nested_ts\n/);
  expect(bundle.skillMd).toContain("MCP toolset");
  expect(bundle.skillMd).toContain("Server id: `nested_ts`");
  expect(bundle.skillMd).toContain("nested_ts://schema");
  expect(bundle.skillMd).toContain("tools/list");
  expect(bundle.skillMd).not.toContain("Invoke via shell");
  expect(bundle.skillMd).not.toContain("reference.md");
  expect(bundle.skillMd).not.toContain("`nested.ts stat owner lookup <path>`");
  expect(bundle.skillMd).not.toContain("## Commands");
});

test("cliSkillInstall writes project Cursor skill files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "argsbarg-skill-"));
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const files = cliSkillInstall(nestedMcpFixture, "cursor", { rimraf: true });
    expect(files.some((f) => f.includes(".cursor/skills/nested_ts/"))).toBe(true);
    const skillDir = join(cwd, ".cursor", "skills", "nested_ts");
    expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(skillDir, "reference.md"))).toBe(true);
    expect(readFileSync(join(skillDir, "SKILL.md"), "utf8")).toContain("## Commands");
    expect(readFileSync(join(skillDir, "reference.md"), "utf8")).toContain("CLI API reference");
    const skillText = readFileSync(join(skillDir, "SKILL.md"), "utf8");
    expect(skillText.startsWith("---\n")).toBe(true);
    const hint = "<!-- Generated by nested.ts install --skill; do not edit. -->";
    expect(skillText.indexOf(hint)).toBeGreaterThan(skillText.indexOf("---\n", 4));
    const refText = readFileSync(join(skillDir, "reference.md"), "utf8");
    expect(refText.startsWith(hint)).toBe(true);
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
    const files = cliSkillInstall(nestedMcpFixture, "cursor", { global: true, rimraf: true });
    expect(files.some((f) => f.includes(join(home, ".cursor", "skills", "nested_ts")))).toBe(true);
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

test("cliSkillInstall rimraf overwrites existing directory", () => {
  const cwd = mkdtempSync(join(tmpdir(), "argsbarg-skill-dup-"));
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    cliSkillInstall(nestedMcpFixture, "cursor", { rimraf: true });
    writeFileSync(join(cwd, ".cursor", "skills", "nested_ts", "SKILL.md"), "stale", "utf8");
    const files = cliSkillInstall(nestedMcpFixture, "cursor", { rimraf: true });
    expect(files.length).toBeGreaterThan(0);
    expect(readFileSync(join(cwd, ".cursor", "skills", "nested_ts", "SKILL.md"), "utf8")).toContain(
      "stat owner lookup",
    );
  } finally {
    process.chdir(prev);
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cliSkillInstall claude target uses .claude/skills", () => {
  const cwd = mkdtempSync(join(tmpdir(), "argsbarg-skill-claude-"));
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const files = cliSkillInstall(nestedMcpFixture, "claude", { rimraf: true });
    expect(files.some((f) => f.includes(".claude/skills/nested_ts/"))).toBe(true);
    expect(readFileSync(join(cwd, ".claude", "skills", "nested_ts", "SKILL.md"), "utf8")).toContain(
      "Claude Code",
    );
  } finally {
    process.chdir(prev);
    rmSync(cwd, { recursive: true, force: true });
  }
});
