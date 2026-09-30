/*
Domain-specific regression tests (split from index.test.ts).
*/

import assert from "node:assert/strict";
import { test } from "node:test";
import { completionBashScript, completionZshScript } from "../builtins/index.ts";
import { cliPresentationRoot } from "../builtins/presentation.ts";
import { argsbarg, FallbackMode, OptionKind } from "../index.ts";
import { applyShellEnv } from "../mcp/env.ts";
import { allMcpResources, collectMcpTools, mcpToolCallToArgv } from "../mcp/tools.ts";
import { cliHelpRender } from "../runtime/help.ts";
import {
  enumMcpFixture,
  nestedDocsFallbackFixture,
  nestedMcpFixture,
  requireMcpTool,
  runNode,
  testProgram,
  varargsReadFixture,
} from "../test/fixtures.ts";
import { ParseKind, parse, postParseValidate } from "./parse.ts";
import { schemaJson } from "./schema.ts";
import { cliValidateProgram } from "./validate.ts";

/** Tests that bundled short presence flags. */
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
            kind: OptionKind.Presence,
            shortName: "a",
          },
          {
            name: "b",
            description: "",
            kind: OptionKind.Presence,
            shortName: "b",
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "-ab"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.equal(pr.opts.a, "1");
  assert.equal(pr.opts.b, "1");
});

/** Tests that long option equals. */
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
            kind: OptionKind.String,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "--name=pat"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.equal(pr.opts.name, "pat");
});

/** Tests that fallback missing or unknown root flags. */
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
            kind: OptionKind.String,
          },
        ],
        handler: () => {},
      },
    ],
    fallbackCommand: "hello",
    fallbackMode: FallbackMode.MissingOrUnknown,
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["--name", "bob"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.path, ["hello"]);
  assert.equal(pr.opts.name, "bob");
});

test("param router descent captures pathParams", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "workspaces",
        description: "Workspaces.",
        commands: [
          {
            key: ":id",
            description: "One workspace.",
            commands: [
              {
                key: "get",
                description: "Get workspace.",
                handler: () => {},
              },
            ],
          },
        ],
      },
    ],
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["workspaces", "qa2", "get"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.path, ["workspaces", ":id", "get"]);
  assert.deepEqual(pr.pathParams, { id: "qa2" });
});

test("cli.enabled cascade blocks disabled router", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "workspaces",
        description: "Disabled.",
        cli: { enabled: false },
        commands: [
          {
            key: "list",
            description: "List.",
            handler: () => {},
          },
        ],
      },
    ],
  });
  cliValidateProgram(root);
  const pr = parse(root, ["workspaces", "list"]);
  assert.equal(pr.kind, ParseKind.Error);
  assert.ok(pr.errorMsg.includes("Unknown command"));
});

test("completion match child emits param router fallback", () => {
  const root = testProgram({
    key: "app",
    description: "Test",
    commands: [
      {
        key: "workspaces",
        description: "Workspaces.",
        commands: [
          {
            key: ":id",
            description: "One workspace.",
            commands: [{ key: "get", description: "Get.", handler: () => {} }],
          },
        ],
      },
    ],
  });
  cliValidateProgram(root);
  const bash = completionBashScript(cliPresentationRoot(root));
  assert.ok(bash.includes("*) echo"));
});

test("unknown command", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [{ key: "hello", description: "", handler: () => {} }],
  });
  cliValidateProgram(root);
  const pr = parse(root, ["nope"]);
  assert.equal(pr.kind, ParseKind.Error);
  assert.ok(pr.errorMsg.includes("Unknown command"));
});

test("implicit help empty", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [{ key: "x", description: "", handler: () => {} }],
  });
  cliValidateProgram(root);
  const pr = parse(root, []);
  assert.equal(pr.kind, ParseKind.Help);
  assert.equal(pr.helpExplicit, false);
});

/** Invalid number post validate. */
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
            kind: OptionKind.Number,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  let pr = parse(root, ["x", "--n", "notnum"]);
  pr = postParseValidate(root, pr);
  assert.equal(pr.kind, ParseKind.Error);
  assert.ok(pr.errorMsg.includes("Invalid number"));
});

/** Supports scientific notation in numbers. */
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
            kind: OptionKind.Number,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  let pr = parse(root, ["x", "--n", "1.23e4"]);
  pr = postParseValidate(root, pr);
  assert.equal(pr.kind, ParseKind.Ok);
  assert.equal(Number(pr.opts.n), 12300);
});

/** Completion scripts contain app name. */
test("completion scripts contain app name", () => {
  const root = testProgram({
    key: "myapp",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  });
  cliValidateProgram(root);
  const bash = completionBashScript(cliPresentationRoot(root));
  assert.ok(bash.includes("bash completion for myapp"));
  assert.ok(bash.includes("complete -F _myapp myapp"));

  const zsh = completionZshScript(cliPresentationRoot(root));
  assert.ok(zsh.includes("#compdef myapp"));
  assert.ok(zsh.includes("compdef _myapp myapp"));
  assert.ok(zsh.includes("hello:Say hello."));
});

/** Completion scripts do not emit invalid bash substitutions. */
test("completion scripts do not emit invalid bash substitutions", () => {
  const root = testProgram({
    key: "app",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  });
  cliValidateProgram(root);
  const bash = completionBashScript(cliPresentationRoot(root));
  assert.ok(!bash.includes("${${"));
});

/** Completion scripts escape shell-sensitive command text in zsh. */
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
  assert.ok(zsh.includes("quote'\\''cmd:Say '\\''hello'\\'' and keep going."));
});

/** Completion scripts keep dotted app names in registration names. */
test("completion scripts keep dotted app names in registration names", () => {
  const root = testProgram({
    key: "minimal.ts",
    description: "Test",
    commands: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  });
  cliValidateProgram(root);

  const bash = completionBashScript(cliPresentationRoot(root));
  assert.ok(bash.includes("complete -F _minimal_ts minimal.ts"));

  const zsh = completionZshScript(cliPresentationRoot(root));
  assert.ok(zsh.includes("compdef _minimal_ts minimal.ts"));
});

/** Tests that trailing options after bounded positionals. */
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
            kind: OptionKind.Presence,
          },
        ],
        positionals: [
          {
            name: "path",
            description: "",
            kind: OptionKind.String,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "./file", "--verbose"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.args, ["./file"]);
  assert.equal(pr.opts.verbose, "1");
});

/** Tests that options can be interleaved between bounded positionals. */
test("options interleaved between bounded positionals", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "copy",
        description: "copy",
        options: [
          {
            name: "force",
            description: "",
            kind: OptionKind.Presence,
            shortName: "f",
          },
          {
            name: "mode",
            description: "",
            kind: OptionKind.String,
          },
        ],
        positionals: [
          {
            name: "src",
            description: "",
            kind: OptionKind.String,
          },
          {
            name: "dest",
            description: "",
            kind: OptionKind.String,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);

  // Presence flag interleaved between positionals
  const prPresence = postParseValidate(root, parse(root, ["copy", "file1", "--force", "file2"]));
  assert.equal(prPresence.kind, ParseKind.Ok);
  assert.deepEqual(prPresence.args, ["file1", "file2"]);
  assert.equal(prPresence.opts.force, "1");

  // String option with value interleaved between positionals
  const prString = postParseValidate(root, parse(root, ["copy", "file1", "--mode", "fast", "file2"]));
  assert.equal(prString.kind, ParseKind.Ok);
  assert.deepEqual(prString.args, ["file1", "file2"]);
  assert.equal(prString.opts.mode, "fast");

  // Multiple flags interleaved between positionals
  const prMulti = postParseValidate(root, parse(root, ["copy", "file1", "--mode", "fast", "-f", "file2"]));
  assert.equal(prMulti.kind, ParseKind.Ok);
  assert.deepEqual(prMulti.args, ["file1", "file2"]);
  assert.equal(prMulti.opts.mode, "fast");
  assert.equal(prMulti.opts.force, "1");

  // Unknown option interleaved between positionals returns error
  const prUnknown = postParseValidate(root, parse(root, ["copy", "file1", "--unknown", "file2"]));
  assert.equal(prUnknown.kind, ParseKind.Error);
  assert.ok(prUnknown.errorMsg.includes("Unknown option: --unknown"));

  // Interleaved help request triggers contextual help
  const prHelp = parse(root, ["copy", "file1", "-h"]);
  assert.equal(prHelp.kind, ParseKind.Help);
  assert.deepEqual(prHelp.helpPath, ["copy"]);

  // Double dash between positionals disables option consumption
  const prDoubleDash = postParseValidate(root, parse(root, ["copy", "file1", "--", "--force"]));
  assert.equal(prDoubleDash.kind, ParseKind.Ok);
  assert.deepEqual(prDoubleDash.args, ["file1", "--force"]);
  assert.equal(prDoubleDash.opts.force, undefined);
});

/** Tests that options can be interleaved with optional positionals. */
test("options interleaved with optional positionals", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "deploy",
        description: "deploy",
        options: [
          {
            name: "force",
            description: "",
            kind: OptionKind.Presence,
          },
        ],
        positionals: [
          {
            name: "env",
            description: "",
            kind: OptionKind.String,
            argMin: 0,
            argMax: 1,
          },
          {
            name: "target",
            description: "",
            kind: OptionKind.String,
            argMin: 0,
            argMax: 1,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);

  // Interleaved between two optional positionals
  const prBoth = postParseValidate(root, parse(root, ["deploy", "prod", "--force", "us-east"]));
  assert.equal(prBoth.kind, ParseKind.Ok);
  assert.deepEqual(prBoth.args, ["prod", "us-east"]);
  assert.equal(prBoth.opts.force, "1");

  // Option after first optional positional when second is omitted
  const prOne = postParseValidate(root, parse(root, ["deploy", "prod", "--force"]));
  assert.equal(prOne.kind, ParseKind.Ok);
  assert.deepEqual(prOne.args, ["prod"]);
  assert.equal(prOne.opts.force, "1");

  // Option before optional positionals when all are omitted
  const prNone = postParseValidate(root, parse(root, ["deploy", "--force"]));
  assert.equal(prNone.kind, ParseKind.Ok);
  assert.deepEqual(prNone.args, []);
  assert.equal(prNone.opts.force, "1");
});

/** Tests that options can be interleaved between bounded positional and varargs tail. */
test("options interleaved between bounded positional and varargs tail", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "upload",
        description: "upload",
        options: [
          {
            name: "json",
            description: "",
            kind: OptionKind.Presence,
          },
        ],
        positionals: [
          {
            name: "target",
            description: "",
            kind: OptionKind.String,
            argMin: 1,
            argMax: 1,
          },
          {
            name: "files",
            description: "",
            kind: OptionKind.String,
            argMin: 1,
            argMax: 0,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);

  // Flag between target and files does not get captured as first file
  const pr = postParseValidate(root, parse(root, ["upload", "s3", "--json", "a.txt", "b.txt"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.args, ["s3", "a.txt", "b.txt"]);
  assert.equal(pr.opts.json, "1");
});

/** Tests that options on command group are rejected at schema validation. */
test("rejects options on command group", () => {
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
            kind: OptionKind.Presence,
          },
        ],
        commands: [
          {
            key: "leaf",
            description: "leaf",
            handler: () => {},
          },
        ],
      },
    ],
  });
  assert.throws(() => cliValidateProgram(root), /command group/);
});

/** Tests that leaf flags are only accepted on the command with a handler segment. */
test("leaf flags are only accepted on the command with a handler segment", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "group",
        description: "group",
        commands: [
          {
            key: "leaf",
            description: "leaf",
            options: [
              {
                name: "json",
                description: "",
                kind: OptionKind.Presence,
              },
              {
                name: "user",
                description: "",
                kind: OptionKind.String,
                shortName: "u",
              },
            ],
            positionals: [
              {
                name: "path",
                description: "",
                kind: OptionKind.String,
              },
            ],
            handler: () => {},
          },
        ],
      },
    ],
  });
  cliValidateProgram(root);
  const ok = postParseValidate(root, parse(root, ["group", "leaf", "-u", "alice", "./file", "--json"]));
  assert.equal(ok.kind, ParseKind.Ok);
  assert.equal(ok.opts.json, "1");

  const bad = parse(root, ["group", "--json", "leaf", "-u", "alice", "./file"]);
  assert.equal(bad.kind, ParseKind.Error);
});

/** Varargs tail parses trailing options. */
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
            kind: OptionKind.Presence,
          },
        ],
        positionals: [
          {
            name: "files",
            description: "",
            kind: OptionKind.String,
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
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.args, ["./file"]);
  assert.equal(pr.opts.json, "1");
});

/** Stops parsing options at --. */
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
            kind: OptionKind.String,
          },
        ],
        positionals: [
          {
            name: "files",
            description: "",
            kind: OptionKind.String,
            argMin: 0,
            argMax: 0,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "--name", "pat", "--", "--name", "bob", "-x"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.equal(pr.opts.name, "pat");
  assert.deepEqual(pr.args, ["--name", "bob", "-x"]);
});

/** Missing required option returns error. */
test("missing required option returns error", () => {
  const root = testProgram({
    key: "app",
    description: "",
    options: [
      {
        name: "req",
        description: "",
        kind: OptionKind.String,
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
  assert.equal(pr.kind, ParseKind.Error);
  assert.ok(pr.errorMsg.includes("Missing required option: --req"));
});

/** Provided required option parses ok. */
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
            kind: OptionKind.String,
            required: true,
          },
        ],
        handler: () => {},
      },
    ],
  });
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["x", "--req", "val"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.equal(pr.opts.req, "val");
});

/** Tests that presence option cannot be required. */
test("presence option cannot be required", () => {
  const root = testProgram({
    key: "app",
    description: "",
    options: [
      {
        name: "flag",
        description: "",
        kind: OptionKind.Presence,
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
  assert.throws(() => cliValidateProgram(root), /Presence option cannot be required/);
});

test("leaf completion help prints correctly", async () => {
  // Test the fix where `completion zsh -h` on a leaf root was incorrectly ignored.
  // We run this as a subprocess so we don't accidentally exit the test runner.
  const { stdout, stderr, exitCode } = runNode(["examples/minimal.ts", "completion", "zsh", "-h"]);
  const out = stdout.toString();
  assert.equal(exitCode, 0);
  assert.ok(out.includes("Show help for this command."));
  assert.ok(out.includes("completion zsh"));
  assert.equal(stderr.toString(), "");
});

test("version builtin prints program version", async () => {
  const { stdout, exitCode } = runNode(["examples/nested.ts", "version"]);
  assert.equal(exitCode, 0);
  assert.match(stdout.toString().trim(), /^\d+\.\d+\.\d+/);
});

test("leaf root help omits hidden completion built-in", async () => {
  const { stdout, exitCode } = runNode(["examples/minimal.ts", "-h"]);
  assert.equal(exitCode, 0);
  assert.ok(!stdout.toString().includes("completion"));
  assert.ok(!stdout.toString().includes("configure"));
});

/** Root --schema is no longer a flag. */
test("root --schema is no longer a flag", () => {
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
  cliValidateProgram(root);
  const pr = parse(cliPresentationRoot(root), ["--schema"]);
  assert.notEqual(pr.kind, ParseKind.Ok);
});

/** CliSchemaJson omits handlers and completion built-ins. */
test("schemaJson omits handlers and completion built-ins", () => {
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

  const schema = JSON.parse(schemaJson(root));
  assert.equal(schema.commands.length, 1);
  assert.equal(schema.commands[0].key, "x");
  assert.ok(!("handler" in schema));
});

/** SchemaExport resolves {argsbarg:program} in consumer notes. */
test("schemaExport resolves {argsbarg:program} in consumer notes", () => {
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

  const schema = JSON.parse(schemaJson(root));
  assert.equal(schema.commands[0].notes, "Run `myapp run` to start.");
});

test("Enum option inputSchema includes enum array", () => {
  const tools = collectMcpTools(enumMcpFixture);
  const run = requireMcpTool(tools, "run");
  const schema = run.inputSchema as { properties: { mode: { enum?: string[] } } };
  assert.deepEqual(schema.properties.mode.enum, ["dev", "prod"]);
});

test("cliValidateProgram rejects Enum with no choices", () => {
  const root = testProgram({
    key: "app",
    description: "",
    handler: () => {},
    options: [{ name: "mode", description: "", kind: OptionKind.Enum, choices: [] }],
  });
  assert.throws(() => cliValidateProgram(root), /requires non-empty choices/);
});

test("cliValidateProgram rejects Enum with duplicate choices", () => {
  const root = testProgram({
    key: "app",
    description: "",
    handler: () => {},
    options: [{ name: "mode", description: "", kind: OptionKind.Enum, choices: ["a", "a"] }],
  });
  assert.throws(() => cliValidateProgram(root), /choices must be distinct/);
});

/** McpTool.description override wins without env suffix. */
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
  assert.equal(tools[0]?.description, "custom");
});

/** CliValidateProgram rejects duplicate mcpResources URIs. */
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
  assert.throws(() => cliValidateProgram(root), /URIs must be unique/);
});

test("cliValidateProgram rejects empty mcpServer", () => {
  const root = testProgram({
    key: "app",
    description: "",
    mcpServer: {} as { enabled: boolean },
    handler: () => {},
  });
  assert.throws(() => cliValidateProgram(root), /mcpServer requires enabled: true/);
});

test("cliValidateProgram rejects empty httpServer", () => {
  const root = testProgram({
    key: "app",
    description: "",
    httpServer: {} as { enabled: boolean },
    handler: () => {},
  });
  assert.throws(() => cliValidateProgram(root), /httpServer requires enabled: true/);
});

/** AllMcpResources includes custom resources. */
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
  assert.deepEqual(
    resources.map((r) => r.uri),
    ["test://x"],
  );
});

/** ApplyShellEnv merges PATH and preserves host vars. */
test("applyShellEnv merges PATH and preserves host vars", () => {
  const origPath = process.env.PATH ?? "";
  const origHome = process.env.HOME;
  process.env.PATH = "/host/bin";
  process.env.HOME = "host-home";
  applyShellEnv({ PATH: "/shell/bin:/host/bin", HOME: "shell-home", NEWVAR: "yes" });
  assert.equal(process.env.PATH?.startsWith("/shell/bin:"), true);
  assert.ok(process.env.PATH.includes("/host/bin"));
  assert.equal(process.env.HOME, "host-home");
  assert.equal(process.env.NEWVAR, "yes");
  process.env.PATH = origPath;
  if (origHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = origHome;
  }
  delete process.env.NEWVAR;
});

/** Enum completions list choices in bash script. */
test("Enum completions list choices in bash script", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "run",
        description: "",
        options: [{ name: "mode", description: "m", kind: OptionKind.Enum, choices: ["dev", "prod"] }],
        handler: () => {},
      },
    ],
  });
  const bash = completionBashScript(cliPresentationRoot(root));
  assert.ok(bash.includes("--mode) COMPREPLY="));
  assert.ok(bash.includes("dev"));
  assert.ok(bash.includes("prod"));
});

test("nested fallback routes to default when argv exhausted at router", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["docs"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.path, ["docs", "guide"]);
});

/** Nested fallback MissingOrUnknown routes unknown token to default. */
test("nested fallback MissingOrUnknown routes unknown token to default", () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "docs",
        description: "Documentation commands.",
        fallbackCommand: "guide",
        fallbackMode: FallbackMode.MissingOrUnknown,
        commands: [
          {
            key: "guide",
            description: "User guide.",
            positionals: [
              {
                name: "topic",
                description: "",
                kind: OptionKind.String,
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
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.path, ["docs", "guide"]);
  assert.deepEqual(pr.args, ["extra-topic"]);
});

test("nested fallback MissingOnly errors on unknown subcommand", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateProgram(root);
  const pr = parse(root, ["docs", "nope"]);
  assert.equal(pr.kind, ParseKind.Error);
  assert.ok(pr.errorMsg.includes("Unknown subcommand"));
});

/** CliValidateProgram rejects invalid nested fallbackCommand. */
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
  assert.throws(() => cliValidateProgram(root), /fallbackCommand 'missing' is not a child of 'docs'/);
});

test("cliValidateProgram accepts nested fallbackCommand when child exists", () => {
  const root = nestedDocsFallbackFixture();
  assert.doesNotThrow(() => cliValidateProgram(root));
});

test("nested router scoped help does not route to fallback", () => {
  const root = nestedDocsFallbackFixture();
  cliValidateProgram(root);
  const pr = parse(root, ["docs", "--help"]);
  assert.equal(pr.kind, ParseKind.Help);
  assert.deepEqual(pr.helpPath, ["docs"]);
  assert.equal(pr.helpExplicit, true);
  const help = cliHelpRender(cliPresentationRoot(root), pr.helpPath, false);
  assert.ok(help.includes("api"));
  assert.ok(help.includes("guide"));
});

test("varargs trailing option after positionals via App.invoke", async () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["read", "file.txt", "--json"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.args, ["file.txt"]);
  assert.equal(pr.opts.json, "1");
});

test("varargs option before positionals", () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["read", "--json", "file.txt"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.args, ["file.txt"]);
  assert.equal(pr.opts.json, "1");
});

test("varargs multiple files then trailing option", () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["read", "a.txt", "b.txt", "--json"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.args, ["a.txt", "b.txt"]);
  assert.equal(pr.opts.json, "1");
});

test("varargs double dash forces positional", () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = postParseValidate(root, parse(root, ["read", "file.txt", "--", "--json"]));
  assert.equal(pr.kind, ParseKind.Ok);
  assert.deepEqual(pr.args, ["file.txt", "--json"]);
  assert.equal(pr.opts.json, undefined);
});

test("varargs unknown flag errors", async () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const result = await argsbarg(root).invoke(["read", "--unknown"]);
  assert.equal(result.kind, "error");
  assert.ok(result.stderr.includes("--unknown"));
});

test("mcpToolCallToArgv rejects comma-separated string for varargs", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = requireMcpTool(tools, "read");
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: "a,b" });
  assert.match((argv as { error: string }).error, /JSON array/);
});

test("mcpToolCallToArgv rejects bare string for varargs", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = requireMcpTool(tools, "read");
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: "a" });
  assert.match((argv as { error: string }).error, /JSON array/);
});

test("mcpToolCallToArgv array varargs unchanged", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = requireMcpTool(tools, "read");
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: ["a", "b"] });
  assert.deepEqual(argv, ["read", "a", "b"]);
});

test("mcpToolCallToArgv empty array varargs errors when required", () => {
  const tools = collectMcpTools(nestedMcpFixture);
  const read = requireMcpTool(tools, "read");
  const argv = mcpToolCallToArgv(nestedMcpFixture, read, { files: [] });
  assert.deepEqual(argv, { error: "Missing argument: files" });
});

// ── Skills ────────────────────────────────────────────────────────────────────
