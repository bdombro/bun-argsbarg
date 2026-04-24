/*
This test file covers parsing, validation, and completion regressions.
It exercises the public API rather than internal helpers so the tests follow the same
paths that users and example CLIs take.

It keeps the CLI contract stable by catching routing, option handling, and generated
shell output regressions.
*/

import { completionBashScript, completionZshScript } from "./completion.ts";
import { CliCommand, CliFallbackMode, CliOptionKind } from "./index.ts";
import { ParseKind, parse, postParseValidate } from "./parse.ts";
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