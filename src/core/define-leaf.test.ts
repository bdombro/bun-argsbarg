/*
Type-level and runtime tests for command's option/positional inference: ctx.inputs is typed from the leaf's own
option and positional literals (no inputSchema), and the runtime values match those types.
*/

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { argsbarg } from "../index.ts";
import { type AppSpec, command, OptionKind, ValueFormat } from "./types.ts";

/** Asserts at compile time that `A` and `B` are the same type. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Compile-time assertion helper. */
function assertType<T extends true>(_value?: T): void {}

describe("command option inference", () => {
  test("types ctx.inputs from option and positional literals and matches runtime values", async () => {
    const run = command({
      key: "run",
      description: "Run.",
      options: [
        { name: "verbose", description: "Verbose.", kind: OptionKind.Presence },
        { name: "limit", description: "Limit.", kind: OptionKind.Number, required: true },
        { name: "env", description: "Env.", kind: OptionKind.Enum, choices: ["dev", "prod"] },
        { name: "timeout", description: "Timeout.", kind: OptionKind.String, format: ValueFormat.Duration },
        { name: "tags", description: "Tags.", kind: OptionKind.String, format: ValueFormat.CommaList },
        { name: "label", description: "Label.", kind: OptionKind.String, default: "none" },
      ],
      positionals: [
        { name: "target", description: "Target.", kind: OptionKind.String },
        { name: "files", description: "Files.", kind: OptionKind.String, argMin: 0, argMax: 0 },
      ],
      handler: (ctx) => {
        const inputs = ctx.inputs;
        assertType<Equal<typeof inputs.verbose, boolean>>();
        assertType<Equal<typeof inputs.limit, number>>();
        assertType<Equal<typeof inputs.env, "dev" | "prod" | undefined>>();
        assertType<Equal<typeof inputs.timeout, number | undefined>>();
        assertType<Equal<typeof inputs.tags, string[] | undefined>>();
        assertType<Equal<typeof inputs.label, string>>();
        assertType<Equal<typeof inputs.target, string>>();
        assertType<Equal<typeof inputs.files, string[] | undefined>>();
        // @ts-expect-error undeclared options are not on ctx.inputs
        void inputs.nope;
        return inputs;
      },
    });

    const program = { key: "app", version: "1.0.0", description: "App.", commands: [run] } satisfies AppSpec;
    const result = await argsbarg(program).invoke(
      ["run", "--limit", "3", "--env", "prod", "--timeout", "2m", "--tags", "a,b", "--verbose", "t", "x.txt"],
      { invocation: "mcp" },
    );
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({
      verbose: true,
      limit: 3,
      env: "prod",
      timeout: 120_000,
      tags: ["a", "b"],
      label: "none",
      target: "t",
      files: ["x.txt"],
    });
  });

  test("an inputSchema still wins over option inference", () => {
    command({
      key: "typed",
      description: "Typed.",
      inputSchema: z.strictObject({ limit: z.string() }),
      options: [{ name: "limit", description: "Limit.", kind: OptionKind.Number }],
      handler: (ctx) => {
        assertType<Equal<typeof ctx.inputs.limit, string>>();
      },
    });
  });
});

describe("argsbarg", () => {
  test("a runnable root types ctx.inputs from its options", async () => {
    const app = argsbarg({
      key: "hello",
      version: "1.0.0",
      description: "Hello.",
      options: [{ name: "name", description: "Who.", kind: OptionKind.String, default: "world" }],
      handler: (ctx) => {
        assertType<Equal<typeof ctx.inputs.name, string>>();
        return `hello ${ctx.inputs.name}`;
      },
    });
    const result = await app.invoke([], { invocation: "mcp" });
    expect(result.response?.body).toBe("hello world");
  });

  test("a grouping root builds an app whose spec is the definition", () => {
    const app = argsbarg({
      key: "app",
      version: "1.0.0",
      description: "App.",
      commands: [command({ key: "run", description: "Run.", handler: () => 1 })],
    });
    expect(app.spec.key).toBe("app");
  });
});
