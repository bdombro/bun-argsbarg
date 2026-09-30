/*
Domain-specific regression tests (split from index.test.ts).
*/

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { ParseKind, parse, postParseValidate } from "../core/parse.ts";
import type { RunnableCommand } from "../core/types.ts";
import { hasSubcommands } from "../core/types.ts";
import { cliValidateProgram } from "../core/validate.ts";
import { argsbarg, type CommandContext, OptionKind } from "../index.ts";
import { runNode, testProgram, varargsReadFixture } from "../test/fixtures.ts";

/** Tests that ctx.invocation is cli via app.run. */
test("ctx.invocation is cli via app.run", async () => {
  const indexPath = join(import.meta.dirname, "../index.ts");
  const { stdout } = runNode([
    "--input-type=module",
    "-e",
    `
import { argsbarg } from ${JSON.stringify(indexPath)};
const program = {
  key: "t",
  description: "d",
  version: "0.0.0",
  handler: (ctx) => console.log(ctx.invocation),
};
await argsbarg(program).run([]);
  `,
  ]);
  assert.equal(stdout.toString().trim(), "cli");
});

/** Verifies app.run runs beforeInvoke/afterInvoke around the handler and routes failures through formatError/onError. */
test("app.run runs app hooks", () => {
  const indexPath = join(import.meta.dirname, "../index.ts");
  const script = (fail: boolean) => `
import { argsbarg } from ${JSON.stringify(indexPath)};
await argsbarg({
  key: "t",
  description: "d",
  version: "0.0.0",
  hooks: {
    beforeInvoke: (ctx) => { ctx.locals.user = "ada"; console.log("before"); },
    afterInvoke: () => console.log("after"),
    formatError: () => ({ message: "formatted", exitCode: 3 }),
    onError: () => console.log("onError"),
  },
  handler: (ctx) => { if (${fail}) throw new Error("boom"); console.log(ctx.locals.user); },
}).run([]);
`;
  const ok = runNode(["--input-type=module", "-e", script(false)]);
  assert.equal(ok.stdout.toString().trim(), "before\nada\nafter");
  const bad = runNode(["--input-type=module", "-e", script(true)]);
  assert.equal(bad.exitCode, 3);
  assert.equal(bad.stdout.toString().trim(), "before\nonError");
  assert.equal(bad.stderr.toString().trim(), "formatted");
});

/** Verifies a disabled built-in's name (`http` without `httpServer`) routes to the app's own command, with hooks. */
test("app command named after a disabled built-in runs with hooks", async () => {
  const seen: string[] = [];
  const root = testProgram({
    key: "app",
    description: "",
    hooks: { beforeInvoke: () => void seen.push("hook") },
    commands: [{ key: "http", description: "App's own http.", handler: () => void seen.push("handler") }],
  });
  const result = await argsbarg(root).invoke(["http"]);
  assert.equal(result.kind, "ok");
  assert.deepEqual(seen, ["hook", "handler"]);
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
  assert.equal(result.kind, "ok");
  assert.equal(seen, "mcp");
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
  assert.equal(result.kind, "ok");
  assert.equal(requestId, wireId);
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
  assert.equal(result.kind, "error");
  assert.ok((result.errorMsg ?? "").includes("not one of"));
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
  assert.equal(result.kind, "ok");
  assert.equal(result.stdout.trim(), "dev");
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

test("varargs scoped help in tail", () => {
  const root = varargsReadFixture();
  cliValidateProgram(root);
  const pr = parse(root, ["read", "file.txt", "--help"]);
  assert.equal(pr.kind, ParseKind.Help);
  assert.ok(pr.helpPath.includes("read"));
  assert.equal(pr.helpExplicit, true);
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
  assert.equal(captured, "./file");
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
  assert.deepEqual(captured, ["a.txt", "b.txt"]);
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
  assert.equal(captured, undefined);
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
  assert.deepEqual(positional, args);
});
