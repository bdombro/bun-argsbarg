/*
Tests for structured document leaves (kind: "document") supporting JSON and YAML document input.
*/

import { describe, expect, test } from "bun:test";
import { Cli } from "../index.ts";
import { LeafInputError, parseDocumentText } from "./leaf-inputs.ts";
import { ParseKind, parse } from "./parse.ts";
import { CliOptionKind, type CliProgram, CliSchemaValidationError } from "./types.ts";
import { cliValidateProgram } from "./validate.ts";

/** JSON Schema for the deployment test document body. */
const deploySchema = {
  type: "object",
  properties: {
    target: { type: "string", enum: ["staging", "production"] },
    config: {
      type: "object",
      properties: { replicas: { type: "integer" } },
      required: ["replicas"],
      additionalProperties: false,
    },
  },
  required: ["target", "config"],
  additionalProperties: false,
} as const;

/** Creates a test program with a single `kind: "document"` leaf command. */
function documentLeafProgram() {
  return {
    key: "document-leaf-test",
    version: "1.0.0",
    description: "document leaf tests",
    commands: [
      {
        key: "deploy",
        description: "Deploy from document body",
        kind: "document",
        inputSchema: deploySchema,
        handler: (ctx) => ctx.inputsAs<{ target: string; config: { replicas: number } }>(),
      },
    ],
  } satisfies CliProgram;
}

/** Tests for `kind: "document"` leaf commands. */
describe("kind: document leaf", () => {
  /** Tests validation rules for document leaves. */
  test("validate requires inputSchema and forbids options/positionals", () => {
    expect(() =>
      cliValidateProgram({
        key: "bad",
        version: "1",
        description: "bad",
        commands: [{ key: "x", description: "x", kind: "document", handler: () => {} }],
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
            kind: "document",
            inputSchema: deploySchema,
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
            kind: "document",
            inputSchema: deploySchema,
            positionals: [{ name: "file", description: "file", kind: CliOptionKind.String }],
            handler: () => {},
          },
        ],
      }),
    ).toThrow(CliSchemaValidationError);
  });

  /** Tests that flags on document leaves are rejected. */
  test("parse rejects CLI flags on document leaf", () => {
    const root = documentLeafProgram();
    const pr = parse(root, ["deploy", "--target", "staging"]);
    expect(pr.kind).toBe(ParseKind.Error);
    expect(pr.errorMsg).toContain("Document commands do not accept options");
  });

  /** Tests that document leaf accepts positional argument tokens. */
  test("parse accepts document positional token", () => {
    const root = documentLeafProgram();
    const pr = parse(root, ["deploy", "target: staging"]);
    expect(pr.kind).toBe(ParseKind.Ok);
    expect(pr.args).toEqual(["target: staging"]);
  });

  /** Tests reading body from YAML positional argv. */
  test("invoke reads body from YAML positional argv", async () => {
    const cli = new Cli(documentLeafProgram());
    const yaml = "target: staging\nconfig:\n  replicas: 3";
    const result = await cli.invoke(["deploy", yaml], { invocation: "mcp" });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ target: "staging", config: { replicas: 3 } });

    const cliResult = await cli.invoke(["deploy", yaml], { invocation: "cli" });
    expect(cliResult.kind).toBe("ok");
    expect(JSON.parse(cliResult.stdout)).toEqual({ target: "staging", config: { replicas: 3 } });
  });

  /** Tests reading body from JSON positional argv. */
  test("invoke reads body from JSON positional argv", async () => {
    const cli = new Cli(documentLeafProgram());
    const json = '{"target":"production","config":{"replicas":5}}';
    const result = await cli.invoke(["deploy", json], { invocation: "mcp" });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ target: "production", config: { replicas: 5 } });
  });

  /** Tests reading body from toolArgs. */
  test("invoke reads body from toolArgs", async () => {
    const cli = new Cli(documentLeafProgram());
    const result = await cli.invoke(["deploy"], {
      invocation: "http",
      toolArgs: { target: "production", config: { replicas: 10 } },
    });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ target: "production", config: { replicas: 10 } });
  });

  /** Tests error message when document body is missing. */
  test("invoke errors when body is missing", async () => {
    const cli = new Cli(documentLeafProgram());
    const result = await cli.invoke(["deploy"], { invocation: "cli" });
    expect(result.kind).toBe("error");
    expect(result.errorMsg).toContain("Missing document input");
  });

  /** Tests inputSchema validation error handling. */
  test("invoke validates inputSchema before handler runs", async () => {
    let handlerRan = false;
    const base = documentLeafProgram();
    const program = {
      ...base,
      commands: [
        {
          ...base.commands[0],
          handler: () => {
            handlerRan = true;
          },
        },
      ],
    } satisfies CliProgram;
    const cli = new Cli(program);
    const result = await cli.invoke(["deploy", "target: invalid-target\nconfig:\n  replicas: 1"], {
      invocation: "cli",
    });
    expect(result.kind).toBe("error");
    expect(handlerRan).toBe(false);
  });

  /** Tests non-object document body returns error. */
  test("non-object document body returns error", async () => {
    const cli = new Cli(documentLeafProgram());
    const result = await cli.invoke(["deploy", '"just-a-string"'], { invocation: "cli" });
    expect(result.kind).toBe("error");
    expect(result.errorMsg).toContain("Document input must be a JSON or YAML object");
  });
});

/** Tests for parseDocumentText helper function. */
describe("parseDocumentText", () => {
  /** Tests parsing valid JSON. */
  test("parses valid JSON object", () => {
    const parsed = parseDocumentText('{"key":"value"}', "test");
    expect(parsed).toEqual({ key: "value" });
  });

  /** Tests parsing valid YAML. */
  test("parses valid YAML object", () => {
    const parsed = parseDocumentText("key: value\nnested:\n  count: 2", "test");
    expect(parsed).toEqual({ key: "value", nested: { count: 2 } });
  });

  /** Tests empty string throws error. */
  test("throws on empty string", () => {
    expect(() => parseDocumentText("   ", "test")).toThrow(LeafInputError);
  });

  /** Tests invalid syntax throws error. */
  test("throws on invalid syntax", () => {
    expect(() => parseDocumentText("{bad json", "test")).toThrow(LeafInputError);
  });
});
