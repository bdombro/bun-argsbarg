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
import { ParseKind, parse, postParseValidate } from "./parse.ts";
import { cliSchemaJson } from "./schema.ts";
import { cliValidateRoot } from "./validate.ts";
import { expect, test } from "bun:test";
import { $ } from "bun";

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