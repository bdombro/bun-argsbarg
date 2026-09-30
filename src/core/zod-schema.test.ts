/*
Tests for the Zod schema adapter and the argsbarg 8 schema contract: typed leaves via command, parsed inputs,
startup emission errors, strictness warnings, and migration errors for argsbarg 7 JSON Schema configs.
*/

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import { executeHeadlessToolCall } from "../headless/tool-call.ts";
import { generateOpenApi } from "../http/openapi.ts";
import { argsbarg } from "../index.ts";
import { collectMcpTools, type McpToolDef, mcpToolCallToArgv } from "../mcp/tools.ts";
import { type AppSpec, command, SchemaValidationError } from "./types.ts";
import { cliValidateProgram, schemaStrictnessWarnings } from "./validate.ts";
import { isZodObjectSchema, isZodSchema, toJsonSchema, validateWithSchema } from "./zod-schema.ts";

/** Discriminated union used by the typed-leaf tests. */
const Shape = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("circle"), radius: z.number() }),
  z.strictObject({ kind: z.literal("rect"), width: z.number(), height: z.number() }),
]);

/** Minimal program wrapping one leaf. */
function programWith(
  /** Leaf definition under test. */
  leaf: object,
): AppSpec {
  return { key: "zapp", version: "1.0.0", description: "Zod tests.", commands: [leaf] } as AppSpec;
}

describe("schema adapter", () => {
  test("toJsonSchema emits draft 2020-12 and memoizes per io side", () => {
    const schema = z.strictObject({ n: z.number().default(1).describe("A number.") });
    const input = toJsonSchema(schema, "input");
    assert.equal(input.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(input.required, undefined);
    assert.equal(toJsonSchema(schema, "input"), input);
    assert.deepEqual(toJsonSchema(schema, "output").required, ["n"]);
    assert.equal(Object.isFrozen(input), true);
  });

  test("validateWithSchema returns the parsed value on success", () => {
    const result = validateWithSchema(z.strictObject({ n: z.number().default(7) }), {});
    assert.deepEqual(result, { valid: true, value: { n: 7 }, errors: [] });
  });

  test("isZodSchema is duck-typed and rejects JSON Schema objects", () => {
    assert.equal(isZodSchema(z.string()), true);
    assert.equal(isZodSchema({ type: "object", properties: {} }), false);
    assert.equal(isZodObjectSchema(z.object({})), true);
    assert.equal(isZodObjectSchema(z.string()), false);
  });
});

describe("command", () => {
  test("types ctx.inputs from inputSchema and narrows discriminated unions", async () => {
    const area = command({
      key: "area",
      description: "Area.",
      kind: "document",
      inputSchema: Shape,
      outputSchema: z.strictObject({ area: z.number() }),
      handler: (ctx) => {
        const shape = ctx.inputs;
        if (shape.kind === "circle") {
          return { area: Math.PI * shape.radius ** 2 };
        }
        // @ts-expect-error radius does not exist on the rect branch
        void shape.radius;
        return { area: shape.width * shape.height };
      },
    });
    command({
      key: "bad",
      description: "Bad.",
      outputSchema: z.strictObject({ area: z.number() }),
      // @ts-expect-error handler return must match outputSchema (no overload accepts it)
      handler: () => ({ area: "x" }),
    });

    const cli = argsbarg(programWith(area));
    const result = await cli.invoke(["area"], {
      invocation: "mcp",
      toolArgs: { kind: "rect", width: 2, height: 3 },
    });
    assert.equal(result.kind, "ok");
    assert.deepEqual(result.response?.body, { area: 6 });
  });

  test("ctx.inputs is the parsed output with defaults applied", async () => {
    const leaf = command({
      key: "greet",
      description: "Greet.",
      kind: "document",
      inputSchema: z.strictObject({ name: z.string(), greeting: z.string().default("hello") }),
      handler: (ctx) => `${ctx.inputs.greeting} ${ctx.inputs.name}`,
    });
    const cli = argsbarg(programWith(leaf));
    const result = await cli.invoke(["greet"], { invocation: "mcp", toolArgs: { name: "ada" } });
    assert.equal(result.kind, "ok");
    assert.equal(result.response?.body, "hello ada");
  });
});

describe("path parameters", () => {
  test("undeclared :param values skip strict validation and merge into ctx.inputs", async () => {
    const put = command({
      key: "put",
      description: "Replace.",
      inputSchema: z.strictObject({ name: z.string() }),
      handler: (ctx) => ({ id: ctx.pathParams.id, merged: ctx.inputs, name: ctx.inputs.name }),
    });
    const program = {
      key: "papp",
      version: "1.0.0",
      description: "Path params.",
      commands: [
        { key: "items", description: "Items.", commands: [{ key: ":id", description: "One.", commands: [put] }] },
      ],
    } as AppSpec;
    const cli = argsbarg(program);
    const result = await cli.invoke(["items", "abc", "put"], { invocation: "mcp", toolArgs: { name: "b" } });
    assert.equal(result.kind, "ok");
    assert.deepEqual(result.response?.body, { id: "abc", merged: { name: "b", id: "abc" }, name: "b" });
  });
});

describe("declared pathParams", () => {
  /** App spec with `items/:id/get`, the leaf declaring or omitting `pathParams`. */
  function itemsProgram(declare: boolean): AppSpec {
    const get = declare
      ? command({
          key: "get",
          description: "Get one item.",
          pathParams: z.strictObject({
            id: z
              .string()
              .regex(/^i-\d+$/)
              .describe("Item id (i-<n>)."),
          }),
          handler: (ctx) => {
            const id: string = ctx.pathParams.id;
            // @ts-expect-error only declared params exist
            void ctx.pathParams.other;
            return { id };
          },
        })
      : command({ key: "get", description: "Get one item.", handler: (ctx) => ({ id: ctx.pathParams.id }) });
    return {
      key: "papp",
      version: "1.0.0",
      description: "Path params.",
      mcpServer: { enabled: true },
      httpServer: { enabled: true },
      commands: [
        { key: "items", description: "Items.", commands: [{ key: ":id", description: "One.", commands: [get] }] },
      ],
    } as AppSpec;
  }

  test("validates and types ctx.pathParams", async () => {
    const cli = argsbarg(itemsProgram(true));
    const ok = await cli.invoke(["items", "i-7", "get"], { invocation: "mcp" });
    assert.deepEqual(ok.response?.body, { id: "i-7" });
    const bad = await cli.invoke(["items", "nope", "get"], { invocation: "mcp" });
    assert.equal(bad.kind, "error");
    assert.ok((bad.errorMsg ?? "").includes("id:"));
  });

  test("MCP tools list path params (described when declared) and route calls to the given value", async () => {
    for (const declare of [true, false]) {
      const program = itemsProgram(declare);
      const tool = collectMcpTools(program).find((t) => t.name.endsWith("get")) as McpToolDef;
      assert.deepEqual(tool.inputSchema.required, ["id"]);
      const idProp = (tool.inputSchema.properties as Record<string, Record<string, unknown>>).id;
      assert.equal(idProp?.description, declare ? "Item id (i-<n>)." : "Path parameter `:id`.");
      const call = await executeHeadlessToolCall(argsbarg(program), tool, { id: "i-3" }, "mcp");
      assert.deepEqual(call.ok && call.response.body, { id: "i-3" });
      assert.deepEqual(mcpToolCallToArgv(program, tool, {}), { error: "Missing path parameter: id" });
    }
  });

  test("OpenAPI path parameters carry pathParams descriptions", () => {
    const doc = generateOpenApi(itemsProgram(true)) as {
      paths: Record<string, { get: { parameters: Array<Record<string, unknown>> } }>;
    };
    const [, item] = Object.entries(doc.paths).find(([path]) => path.includes("{id}")) ?? [];
    const param = item?.get.parameters.find((p) => p.name === "id");
    assert.partialDeepStrictEqual(param, {
      in: "path",
      required: true,
      description: "Item id (i-<n>).",
      schema: { type: "string" },
    });
  });

  test("startup rejects pathParams that don't match the route or clash with inputSchema", () => {
    const leaf = (extra: object) => ({ key: "get", description: "Get.", handler: () => {}, ...extra });
    const program = (l: object) =>
      ({
        key: "papp",
        version: "1.0.0",
        description: "Path params.",
        commands: [
          { key: "items", description: "Items.", commands: [{ key: ":id", description: "One.", commands: [l] }] },
        ],
      }) as AppSpec;
    assert.throws(
      () => cliValidateProgram(program(leaf({ pathParams: z.strictObject({ uid: z.string() }) }))),
      /must declare exactly the path parameters \[id\]/,
    );
    assert.throws(
      () =>
        cliValidateProgram(
          program(
            leaf({
              pathParams: z.strictObject({ id: z.string() }),
              kind: "document",
              inputSchema: z.strictObject({ id: z.string() }),
            }),
          ),
        ),
      /id is also declared by inputSchema/,
    );
  });
});

describe("program validation", () => {
  test("unrepresentable schemas fail at startup and name the leaf", () => {
    const leaf = {
      key: "when",
      description: "When.",
      kind: "document",
      inputSchema: z.strictObject({ at: z.date() }),
      handler: () => {},
    };
    assert.throws(
      () => cliValidateProgram(programWith(leaf)),
      /inputSchema on when cannot be represented as JSON Schema/,
    );
  });

  test("JSON Schema inputSchema values get a migration error", () => {
    const leaf = {
      key: "old",
      description: "Old.",
      kind: "document",
      inputSchema: { type: "object" },
      handler: () => {},
    };
    assert.throws(() => cliValidateProgram(programWith(leaf)), SchemaValidationError);
    assert.throws(() => cliValidateProgram(programWith(leaf)), /inputSchema on old must be a Zod schema/);
  });

  test("removed root fields get a migration error", () => {
    const base = { key: "cfg", version: "1.0.0", description: "Cfg.", handler: () => {} };
    assert.throws(
      () => cliValidateProgram({ ...base, appConfig: { entries: {} } } as unknown as AppSpec),
      /appConfig is no longer supported/,
    );
    assert.throws(
      () => cliValidateProgram({ ...base, configure: {} } as unknown as AppSpec),
      /configure is no longer supported/,
    );
  });

  test("strictness warnings flag input objects that accept unknown keys", () => {
    const program = {
      key: "warn",
      version: "1.0.0",
      description: "Warn.",
      commands: [
        {
          key: "loose",
          description: "Loose.",
          kind: "document",
          inputSchema: z.object({ a: z.string() }),
          handler: () => {},
        },
        { key: "tight", description: "Tight.", kind: "document", inputSchema: Shape, handler: () => {} },
      ],
    } as AppSpec;
    const warnings = schemaStrictnessWarnings(program);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("inputSchema on loose accepts unknown keys at $"));
  });
});
