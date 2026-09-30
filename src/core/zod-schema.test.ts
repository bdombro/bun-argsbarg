/*
Tests for the Zod schema adapter and the argsbarg 8 schema contract: typed leaves via command, parsed inputs,
startup emission errors, strictness warnings, and migration errors for argsbarg 7 JSON Schema configs.
*/

import { describe, expect, test } from "bun:test";
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
    expect(input.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(input.required).toBeUndefined();
    expect(toJsonSchema(schema, "input")).toBe(input);
    expect(toJsonSchema(schema, "output").required).toEqual(["n"]);
    expect(Object.isFrozen(input)).toBe(true);
  });

  test("validateWithSchema returns the parsed value on success", () => {
    const result = validateWithSchema(z.strictObject({ n: z.number().default(7) }), {});
    expect(result).toEqual({ valid: true, value: { n: 7 }, errors: [] });
  });

  test("isZodSchema is duck-typed and rejects JSON Schema objects", () => {
    expect(isZodSchema(z.string())).toBe(true);
    expect(isZodSchema({ type: "object", properties: {} })).toBe(false);
    expect(isZodObjectSchema(z.object({}))).toBe(true);
    expect(isZodObjectSchema(z.string())).toBe(false);
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
    // @ts-expect-error handler return must match outputSchema (no overload accepts it)
    command({
      key: "bad",
      description: "Bad.",
      outputSchema: z.strictObject({ area: z.number() }),
      handler: () => ({ area: "x" }),
    });

    const cli = argsbarg(programWith(area));
    const result = await cli.invoke(["area"], {
      invocation: "mcp",
      toolArgs: { kind: "rect", width: 2, height: 3 },
    });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ area: 6 });
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
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toBe("hello ada");
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
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ id: "abc", merged: { name: "b", id: "abc" }, name: "b" });
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
    expect(ok.response?.body).toEqual({ id: "i-7" });
    const bad = await cli.invoke(["items", "nope", "get"], { invocation: "mcp" });
    expect(bad.kind).toBe("error");
    expect(bad.errorMsg).toContain("id:");
  });

  test("MCP tools list path params (described when declared) and route calls to the given value", async () => {
    for (const declare of [true, false]) {
      const program = itemsProgram(declare);
      const tool = collectMcpTools(program).find((t) => t.name.endsWith("get")) as McpToolDef;
      expect(tool.inputSchema.required).toEqual(["id"]);
      const idProp = (tool.inputSchema.properties as Record<string, Record<string, unknown>>).id;
      expect(idProp?.description).toBe(declare ? "Item id (i-<n>)." : "Path parameter `:id`.");
      const call = await executeHeadlessToolCall(argsbarg(program), tool, { id: "i-3" }, "mcp");
      expect(call.ok && call.response.body).toEqual({ id: "i-3" });
      expect(mcpToolCallToArgv(program, tool, {})).toEqual({ error: "Missing path parameter: id" });
    }
  });

  test("OpenAPI path parameters carry pathParams descriptions", () => {
    const doc = generateOpenApi(itemsProgram(true)) as {
      paths: Record<string, { get: { parameters: Array<Record<string, unknown>> } }>;
    };
    const [, item] = Object.entries(doc.paths).find(([path]) => path.includes("{id}")) ?? [];
    const param = item?.get.parameters.find((p) => p.name === "id");
    expect(param).toMatchObject({
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
    expect(() => cliValidateProgram(program(leaf({ pathParams: z.strictObject({ uid: z.string() }) })))).toThrow(
      /must declare exactly the path parameters \[id\]/,
    );
    expect(() =>
      cliValidateProgram(
        program(
          leaf({
            pathParams: z.strictObject({ id: z.string() }),
            kind: "document",
            inputSchema: z.strictObject({ id: z.string() }),
          }),
        ),
      ),
    ).toThrow(/id is also declared by inputSchema/);
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
    expect(() => cliValidateProgram(programWith(leaf))).toThrow(
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
    expect(() => cliValidateProgram(programWith(leaf))).toThrow(SchemaValidationError);
    expect(() => cliValidateProgram(programWith(leaf))).toThrow(/inputSchema on old must be a Zod schema/);
  });

  test("appConfig.jsonSchema gets a migration error and appConfig.schema must be an object", () => {
    const base = { key: "cfg", version: "1.0.0", description: "Cfg.", handler: () => {} };
    expect(() =>
      cliValidateProgram({
        ...base,
        appConfig: { jsonSchema: { type: "object" }, entries: {} } as unknown as AppSpec["appConfig"],
      }),
    ).toThrow(/replaced by appConfig.schema/);
    expect(() =>
      cliValidateProgram({
        ...base,
        appConfig: { schema: z.string() as unknown as z.ZodObject, entries: {} },
      }),
    ).toThrow(/must be a Zod object schema/);
    expect(() =>
      cliValidateProgram({
        ...base,
        appConfig: { schema: z.strictObject({}), entries: { token: { description: "Token." } } },
      }),
    ).toThrow(/entries key 'token' is missing from schema.shape/);
  });

  test("strictness warnings flag input and config objects that accept unknown keys", () => {
    const program = {
      key: "warn",
      version: "1.0.0",
      description: "Warn.",
      appConfig: { schema: z.object({ token: z.string() }), entries: { token: { description: "Token." } } },
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
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("inputSchema on loose accepts unknown keys at $");
    expect(warnings[1]).toContain("appConfig.schema accepts unknown keys");
  });
});
