import { describe, expect, test } from "bun:test";
import { Cli } from "~/index";
import { ParseKind, parse } from "./parse.ts";
import { CliOptionKind, type CliProgram, CliSchemaValidationError } from "./types.ts";
import { cliValidateProgram } from "./validate.ts";

const bodySchema = {
  type: "object",
  properties: {
    format: { type: "string", enum: ["pdf", "html"] },
    invoice: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  required: ["format", "invoice"],
  additionalProperties: false,
} as const;

function jsonLeafProgram() {
  return {
    key: "json-leaf-test",
    version: "1.0.0",
    description: "json leaf tests",
    commands: [
      {
        key: "render",
        description: "Render from JSON body",
        kind: "json",
        inputSchema: bodySchema,
        handler: (ctx) => ctx.inputsAs<{ format: string; invoice: { id: string } }>(),
      },
    ],
  } satisfies CliProgram;
}

describe("kind: json leaf", () => {
  test("validate requires inputSchema and forbids options/positionals", () => {
    expect(() =>
      cliValidateProgram({
        key: "bad",
        version: "1",
        description: "bad",
        commands: [{ key: "x", description: "x", kind: "json", handler: () => {} }],
      }),
    ).toThrow(CliSchemaValidationError);

    expect(() =>
      cliValidateProgram({
        key: "bad",
        version: "1",
        description: "bad",
        commands: [
          {
            key: "x",
            description: "x",
            kind: "json",
            inputSchema: bodySchema,
            options: [{ name: "f", description: "f", kind: CliOptionKind.String }],
            handler: () => {},
          },
        ],
      }),
    ).toThrow(CliSchemaValidationError);

    expect(() =>
      cliValidateProgram({
        key: "bad",
        version: "1",
        description: "bad",
        commands: [
          {
            key: "x",
            description: "x",
            kind: "json",
            inputSchema: bodySchema,
            positionals: [{ name: "file", description: "file", kind: CliOptionKind.String }],
            handler: () => {},
          },
        ],
      }),
    ).toThrow(CliSchemaValidationError);
  });

  test("parse rejects CLI flags on json leaf", () => {
    const root = jsonLeafProgram();
    const pr = parse(root, ["render", "--format", "pdf"]);
    expect(pr.kind).toBe(ParseKind.Error);
    expect(pr.errorMsg).toContain("JSON commands do not accept options");
  });

  test("parse accepts JSON positional", () => {
    const root = jsonLeafProgram();
    const pr = parse(root, ["render", '{"format":"pdf","invoice":{"id":"1"}}']);
    expect(pr.kind).toBe(ParseKind.Ok);
    expect(pr.args).toEqual(['{"format":"pdf","invoice":{"id":"1"}}']);
  });

  test("invoke reads body from toolArgs", async () => {
    const cli = new Cli(jsonLeafProgram());
    const result = await cli.invoke(["render"], {
      invocation: "http",
      toolArgs: { format: "pdf", invoice: { id: "INV-1" } },
    });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ format: "pdf", invoice: { id: "INV-1" } });
  });

  test("invoke reads body from JSON positional argv", async () => {
    const cli = new Cli(jsonLeafProgram());
    const result = await cli.invoke(["render", '{"format":"html","invoice":{"id":"2"}}'], {
      invocation: "mcp",
    });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ format: "html", invoice: { id: "2" } });
  });

  test("invoke errors when body missing", async () => {
    const cli = new Cli(jsonLeafProgram());
    const result = await cli.invoke(["render"], { invocation: "http" });
    expect(result.kind).toBe("error");
    expect(result.errorMsg).toContain("Missing JSON input");
  });

  test("invoke validates inputSchema before handler", async () => {
    let called = false;
    const base = jsonLeafProgram();
    const program = {
      ...base,
      commands: [
        {
          ...base.commands[0],
          handler: () => {
            called = true;
          },
        },
      ],
    } satisfies CliProgram;
    const cli = new Cli(program);
    const result = await cli.invoke(["render"], {
      invocation: "http",
      toolArgs: { format: "pdf", invoice: { id: 123 } },
    });
    expect(result.kind).toBe("error");
    expect(called).toBe(false);
  });

  test("non-object JSON body returns error", async () => {
    const cli = new Cli(jsonLeafProgram());
    const result = await cli.invoke(["render", '"not-an-object"'], { invocation: "cli" });
    expect(result.kind).toBe("error");
    expect(result.errorMsg).toContain("JSON input must be a JSON object");
  });
});
