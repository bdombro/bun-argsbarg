/*
Domain-specific regression tests (split from index.test.ts).
*/

import { expect, test } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { ParseKind, parse, postParseValidate } from "../core/parse.ts";
import type { RunnableCommand } from "../core/types.ts";
import { hasSubcommands } from "../core/types.ts";
import { cliValidateProgram } from "../core/validate.ts";
import { argsbarg, type CommandContext, OptionKind } from "../index.ts";
import { testProgram, varargsReadFixture } from "../test/fixtures.ts";

/** Tests that ctx.invocation is cli via app.run. */
test("ctx.invocation is cli via app.run", async () => {
  const indexPath = join(import.meta.dir, "../index.ts");
  const { stdout } = await $`bun -e ${`
import { argsbarg } from ${JSON.stringify(indexPath)};
const program = {
  key: "t",
  description: "d",
  version: "0.0.0",
  configure: { enabled: false },
  handler: (ctx) => console.log(ctx.invocation),
};
await argsbarg(program).run([]);
  `}`.quiet();
  expect(stdout.toString().trim()).toBe("cli");
});

/** Tests that ctx.invocation is mcp via App.invoke. */
test("ctx.invocation is mcp via App.invoke", async () => {
  let seen = "";
  const root = testProgram({
    key: "app",
    description: "",
    handler: (ctx: CommandContext) => {
      seen = ctx.invocation;
    },
  });
  cliValidateProgram(root);
  const result = await argsbarg(root).invoke([]);
  expect(result.kind).toBe("ok");
  expect(seen).toBe("mcp");
});

/** Tests that ctx.locals.requestId is seeded before handler on invoke. */
test("App.invoke seeds ctx.locals.requestId", async () => {
  let requestId = "";
  const root = testProgram({
    key: "app",
    description: "",
    hooks: {
      beforeInvoke: (ctx: CommandContext) => {
        requestId = String(ctx.locals.requestId ?? "");
      },
    },
    handler: () => {},
  });
  cliValidateProgram(root);
  const wireId = "00000000-0000-4000-8000-000000000001";
  const result = await argsbarg(root).invoke([], {
    invocation: "http",
    requestId: wireId,
    http: { request: new Request("http://localhost/"), clientIp: "127.0.0.1", requestId: wireId },
  });
  expect(result.kind).toBe("ok");
  expect(requestId).toBe(wireId);
});

/** App.invoke rejects invalid Enum value. */
test("App.invoke rejects invalid Enum value", async () => {
  const root = testProgram({
    key: "app",
    description: "",
    handler: () => {},
    options: [
      {
        name: "mode",
        description: "Mode.",
        kind: OptionKind.Enum,
        choices: ["dev", "prod"],
        required: true,
      },
    ],
  });
  cliValidateProgram(root);
  const result = await argsbarg(root).invoke(["--mode", "staging"]);
  expect(result.kind).toBe("error");
  expect(result.errorMsg).toContain("not one of");
});

/** App.invoke accepts valid Enum value. */
test("App.invoke accepts valid Enum value", async () => {
  const root = testProgram({
    key: "app",
    description: "",
    handler: (ctx: CommandContext) => {
      console.log(ctx.stringOpt("mode"));
    },
    options: [
      {
        name: "mode",
        description: "Mode.",
        kind: OptionKind.Enum,
        choices: ["dev", "prod"],
        required: true,
      },
    ],
  });
  cliValidateProgram(root);
  const result = await argsbarg(root).invoke(["--mode", "dev"]);
  expect(result.kind).toBe("ok");
  expect(result.stdout.trim()).toBe("dev");
});

test("varargs trailing option after positionals via App.invoke", async () => {
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
  const result = await argsbarg(root).invoke(["read", "--unknown"]);
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

/** Tests that ctx.positional returns single slot value. */
test("ctx.positional returns single slot value", async () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        positionals: [{ name: "path", description: "", kind: OptionKind.String }],
        handler: (ctx: CommandContext) => {
          captured = ctx.positional("path");
        },
      },
    ],
  });
  let captured: string | string[] | undefined;
  cliValidateProgram(root);
  await argsbarg(root).invoke(["x", "./file"]);
  expect(captured).toBe("./file");
});

test("ctx.positional returns varargs array", async () => {
  const root = varargsReadFixture();
  let captured: string | string[] | undefined;
  if (hasSubcommands(root)) {
    (root.commands[0] as RunnableCommand).handler = (ctx) => {
      captured = ctx.positional("files");
    };
  }
  cliValidateProgram(root);
  await argsbarg(root).invoke(["read", "a.txt", "b.txt"]);
  expect(captured).toEqual(["a.txt", "b.txt"]);
});

/** Tests that ctx.positional returns undefined for absent optional slot. */
test("ctx.positional returns undefined for absent optional slot", async () => {
  const root = testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "x",
        description: "",
        positionals: [{ name: "opt", description: "", kind: OptionKind.String, argMin: 0, argMax: 1 }],
        handler: (ctx: CommandContext) => {
          captured = ctx.positional("opt");
        },
      },
    ],
  });
  let captured: string | string[] | undefined;
  cliValidateProgram(root);
  await argsbarg(root).invoke(["x"]);
  expect(captured).toBeUndefined();
});

/** Tests that ctx.positional varargs matches ctx.args. */
test("ctx.positional varargs matches ctx.args", async () => {
  const root = varargsReadFixture();
  let positional: string | string[] | undefined;
  let args: string[] = [];
  if (hasSubcommands(root)) {
    (root.commands[0] as RunnableCommand).handler = (ctx) => {
      positional = ctx.positional("files");
      args = ctx.args;
    };
  }
  cliValidateProgram(root);
  await argsbarg(root).invoke(["read", "a.txt", "b.txt"]);
  expect(positional).toEqual(args);
});
