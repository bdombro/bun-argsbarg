/*
Domain-specific regression tests (split from index.test.ts).
*/

import { expect, test } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { Cli, type CliContext, CliOptionKind } from "./index.ts";
import { ParseKind, parse, postParseValidate } from "./parse.ts";
import { testProgram, varargsReadFixture } from "./test-fixtures.ts";
import type { CliLeaf } from "./types.ts";
import { isCliRouter } from "./types.ts";
import { cliValidateProgram } from "./validate.ts";

test("ctx.invocation is cli via Cli.run", async () => {
  const indexPath = join(import.meta.dir, "index.ts");
  const { stdout } = await $`bun -e ${`
import { Cli, CliProgram } from ${JSON.stringify(indexPath)};
const program = {
  key: "t",
  description: "d",
  version: "0.0.0",
  install: { enabled: false },
  handler: (ctx) => console.log(ctx.invocation),
};
await new Cli(program).run([]);
  `}`.quiet();
  expect(stdout.toString().trim()).toBe("cli");
});

test("ctx.invocation is mcp via Cli.invoke", async () => {
  let seen = "";
  const root = testProgram({
    key: "app",
    description: "",
    handler: (ctx: CliContext) => {
      seen = ctx.invocation;
    },
  });
  cliValidateProgram(root);
  const result = await new Cli(root).invoke([]);
  expect(result.kind).toBe("ok");
  expect(seen).toBe("mcp");
});

test("Cli.invoke rejects invalid Enum value", async () => {
  const root = testProgram({
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
  });
  cliValidateProgram(root);
  const result = await new Cli(root).invoke(["--mode", "staging"]);
  expect(result.kind).toBe("error");
  expect(result.errorMsg).toContain("not one of");
});

test("Cli.invoke accepts valid Enum value", async () => {
  const root = testProgram({
    key: "app",
    description: "",
    handler: (ctx: CliContext) => {
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
  });
  cliValidateProgram(root);
  const result = await new Cli(root).invoke(["--mode", "dev"]);
  expect(result.kind).toBe("ok");
  expect(result.stdout.trim()).toBe("dev");
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

test("varargs scoped help in tail", () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = parse(root, ["read", "file.txt", "--help"]);
  expect(pr.kind).toBe(ParseKind.Help);
  expect(pr.helpPath).toContain("read");
  expect(pr.helpExplicit).toBe(true);
});

test("ctx.positional returns single slot value", async () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        positionals: [{ name: "path", description: "", kind: CliOptionKind.String }],
        handler: (ctx: CliContext) => {
          captured = ctx.positional("path");
        },
      },
    ],
  });
  let captured: string | string[] | undefined;
  cliValidateProgram(root);
  await new Cli(root).invoke(["x", "./file"]);
  expect(captured).toBe("./file");
});

test("ctx.positional returns varargs array", async () => {
  const root = varargsReadFixture();
  let captured: string | string[] | undefined;
  if (isCliRouter(root)) {
    (root.commands[0] as CliLeaf).handler = (ctx) => {
      captured = ctx.positional("files");
    };
  }
  cliValidateProgram(root);
  await new Cli(root).invoke(["read", "a.txt", "b.txt"]);
  expect(captured).toEqual(["a.txt", "b.txt"]);
});

test("ctx.positional returns undefined for absent optional slot", async () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        positionals: [
          { name: "opt", description: "", kind: CliOptionKind.String, argMin: 0, argMax: 1 },
        ],
        handler: (ctx: CliContext) => {
          captured = ctx.positional("opt");
        },
      },
    ],
  });
  let captured: string | string[] | undefined;
  cliValidateProgram(root);
  await new Cli(root).invoke(["x"]);
  expect(captured).toBeUndefined();
});

test("ctx.positional varargs matches ctx.args", async () => {
  const root = varargsReadFixture();
  let positional: string | string[] | undefined;
  let args: string[] = [];
  if (isCliRouter(root)) {
    (root.commands[0] as CliLeaf).handler = (ctx) => {
      positional = ctx.positional("files");
      args = ctx.args;
    };
  }
  cliValidateProgram(root);
  await new Cli(root).invoke(["read", "a.txt", "b.txt"]);
  expect(positional).toEqual(args);
});
