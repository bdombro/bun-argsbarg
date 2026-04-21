/*
This test file covers parsing, validation, and completion regressions.
It exercises the public API rather than internal helpers so the tests follow the same
paths that users and example CLIs take.

It keeps the CLI contract stable by catching routing, option handling, and generated
shell output regressions.
*/

import {
  CliCommand,
  createOption,
  CliOptionKind,
  CliFallbackMode,
  cliValidateRoot,
  parse,
  postParseValidate,
  completionBashScript,
  completionZshScript,
  ParseKind,
} from "./index.ts";
import { expect, test } from "bun:test";

test("bundled short presence flags", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    children: [
      {
        key: "x",
        description: "cmd",
        options: [
          createOption("a", "", { kind: CliOptionKind.Presence, shortName: "a" }),
          createOption("b", "", { kind: CliOptionKind.Presence, shortName: "b" }),
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
    children: [
      {
        key: "x",
        description: "cmd",
        options: [createOption("name", "", { kind: CliOptionKind.String })],
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
    children: [
      {
        key: "hello",
        description: "Say hi.",
        options: [createOption("name", "", { kind: CliOptionKind.String })],
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
    children: [{ key: "hello", description: "", handler: () => {} }],
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
    children: [{ key: "x", description: "", handler: () => {} }],
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
    children: [
      {
        key: "x",
        description: "",
        options: [createOption("n", "", { kind: CliOptionKind.Number })],
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
    children: [
      {
        key: "x",
        description: "",
        options: [createOption("n", "", { kind: CliOptionKind.Number })],
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

test("root must not have handler", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    children: [{ key: "x", description: "", handler: () => {} }],
    handler: () => {},
  };
  expect(() => cliValidateRoot(root)).toThrow(/Program root must not set handler/);
});

test("root must not have positionals", () => {
  const root: CliCommand = {
    key: "app",
    description: "",
    positionals: [
      createOption("p", "", { kind: CliOptionKind.String, positional: true }),
    ],
    children: [{ key: "x", description: "", handler: () => {} }],
  };
  expect(() => cliValidateRoot(root)).toThrow(/Program root must not declare positionals/);
});

test("completion scripts contain app name", () => {
  const root: CliCommand = {
    key: "myapp",
    description: "Test",
    children: [{ key: "hello", description: "Say hello.", handler: () => {} }],
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
    children: [{ key: "hello", description: "Say hello.", handler: () => {} }],
  };
  cliValidateRoot(root);
  const bash = completionBashScript(root);
  expect(bash).not.toContain("${${");
});

test("completion scripts escape shell-sensitive command text in zsh", () => {
  const root: CliCommand = {
    key: "app",
    description: "Test",
    children: [
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
    children: [{ key: "hello", description: "Say hello.", handler: () => {} }],
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
    children: [
      {
        key: "x",
        description: "cmd",
        options: [createOption("name", "", { kind: CliOptionKind.String })],
        positionals: [
          createOption("files", "", { kind: CliOptionKind.String, positional: true, argMax: 0, argMin: 0 })
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