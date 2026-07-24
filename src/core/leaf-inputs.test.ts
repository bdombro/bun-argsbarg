import { describe, expect, test } from "bun:test";
import { Cli, CliContext, CliOptionKind } from "~/index";
import { LeafInputError, loadLeafInputs } from "./leaf-inputs.ts";
import type { CliProgram } from "./types.ts";

const invoiceSchema = {
  type: "object",
  properties: {
    format: { type: "string", enum: ["pdf", "html"] },
    invoice: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  required: ["format", "invoice"],
  additionalProperties: false,
} as const;

function renderProgram(): CliProgram {
  return {
    key: "json-pipe-test",
    version: "1.0.0",
    description: "Json pipable option tests",
    commands: [
      {
        key: "render",
        description: "Render with pipable invoice JSON",
        inputSchema: invoiceSchema,
        options: [
          {
            name: "format",
            description: "Output format",
            kind: CliOptionKind.Enum,
            choices: ["pdf", "html"],
            required: true,
          },
          {
            name: "invoice",
            description: "Invoice JSON (flag or stdin)",
            kind: CliOptionKind.Json,
            pipable: true,
            required: true,
          },
        ],
        handler: (ctx) => ctx.inputs,
      },
    ],
  } satisfies CliProgram;
}

describe("loadLeafInputs / jsonOpt", () => {
  test("reads Json option from MCP toolArgs", async () => {
    const cli = new Cli(renderProgram());
    const result = await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: "INV-1" } },
    });
    expect(result.kind).toBe("ok");
    expect(result.exitCode).toBe(0);
    expect(result.response?.body).toEqual({
      format: "pdf",
      invoice: { id: "INV-1" },
    });
  });

  test("flag wins over toolArgs for Json option", async () => {
    const cli = new Cli(renderProgram());
    const result = await cli.invoke(["render", "--format", "pdf", "--invoice", '{"id":"from-flag"}'], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: "from-tool-args" } },
    });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({
      format: "pdf",
      invoice: { id: "from-flag" },
    });
  });

  test("jsonOpt reads from preloadedJson", () => {
    const program = renderProgram();
    const ctx = new CliContext(
      "json-pipe-test",
      ["render"],
      [],
      { format: "pdf" },
      program,
      "cli",
      undefined,
      undefined,
      { invoice: { id: "piped" } },
    );
    expect(ctx.jsonOpt("invoice")).toEqual({ id: "piped" });
    expect(ctx.inputs).toEqual({ format: "pdf", invoice: { id: "piped" } });
  });

  test("inputsAs returns schemagen-shaped inputs", () => {
    type RenderInput = { format: "pdf" | "html"; invoice: { id: string } };
    const program = renderProgram();
    const ctx = new CliContext("json-pipe-test", ["render"], [], { format: "pdf" }, program, "mcp", undefined, {
      format: "pdf",
      invoice: { id: "INV-1" },
    });
    expect(ctx.inputsAs<RenderInput>()).toEqual({ format: "pdf", invoice: { id: "INV-1" } });
  });

  test("rejects invalid Json flag at parse time", async () => {
    const cli = new Cli(renderProgram());
    const result = await cli.invoke(["render", "--format", "pdf", "--invoice", "not-json"], {
      invocation: "mcp",
      toolArgs: {},
    });
    expect(result.kind).toBe("error");
    expect(result.errorMsg).toContain("Invalid JSON");
  });

  test("validates merged inputs against inputSchema", async () => {
    const cli = new Cli(renderProgram());
    const result = await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: 123 } },
    });
    expect(result.kind).toBe("error");
    expect(result.stderr).toContain("invoice.id");
  });

  test("validates inputSchema before handler runs", async () => {
    let handlerCalled = false;
    const program = {
      key: "json-pipe-test",
      version: "1.0.0",
      description: "pre-handler validation",
      commands: [
        {
          key: "render",
          description: "Render",
          inputSchema: invoiceSchema,
          options: [
            {
              name: "format",
              description: "Output format",
              kind: CliOptionKind.Enum,
              choices: ["pdf", "html"],
              required: true,
            },
            {
              name: "invoice",
              description: "Invoice JSON",
              kind: CliOptionKind.Json,
              pipable: true,
              required: true,
            },
          ],
          handler: () => {
            handlerCalled = true;
            return { ok: true };
          },
        },
      ],
    } satisfies CliProgram;
    const cli = new Cli(program);
    const result = await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: 123 } },
    });
    expect(result.kind).toBe("error");
    expect(handlerCalled).toBe(false);
  });

  test("inputs returns cached inputs after pre-handler validation", async () => {
    const inputs: unknown[] = [];
    const program = {
      key: "json-pipe-test",
      version: "1.0.0",
      description: "cached inputs",
      commands: [
        {
          key: "render",
          description: "Render",
          inputSchema: invoiceSchema,
          options: [
            {
              name: "format",
              description: "Output format",
              kind: CliOptionKind.Enum,
              choices: ["pdf", "html"],
              required: true,
            },
            {
              name: "invoice",
              description: "Invoice JSON",
              kind: CliOptionKind.Json,
              required: true,
            },
          ],
          handler: (ctx) => {
            inputs.push(ctx.inputs);
            inputs.push(ctx.inputs);
          },
        },
      ],
    } satisfies CliProgram;
    const cli = new Cli(program);
    await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: "INV-1" } },
    });
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual(inputs[1]);
  });

  test("loadLeafInputs throws LeafInputError when required Json is missing", () => {
    const program = renderProgram();
    const ctx = new CliContext("json-pipe-test", ["render"], [], { format: "pdf" }, program, "mcp", undefined, {});
    expect(() => loadLeafInputs(ctx)).toThrow(LeafInputError);
  });

  test("omits undefined optional properties before inputSchema validation", async () => {
    const schemaWithOptional = {
      type: "object",
      properties: {
        format: { type: "string", enum: ["pdf", "html"] },
        template: { type: "string" },
        invoice: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      },
      required: ["format", "invoice"],
      additionalProperties: false,
    };
    const program = {
      key: "json-pipe-test",
      version: "1.0.0",
      description: "optional template",
      commands: [
        {
          key: "render",
          description: "Render",
          inputSchema: schemaWithOptional,
          options: [
            {
              name: "format",
              description: "Output format",
              kind: CliOptionKind.Enum,
              choices: ["pdf", "html"],
              required: true,
            },
            {
              name: "template",
              description: "Template name",
              kind: CliOptionKind.String,
            },
            {
              name: "invoice",
              description: "Invoice JSON",
              kind: CliOptionKind.Json,
              pipable: true,
              required: true,
            },
          ],
          handler: (ctx) => ctx.inputs,
        },
      ],
    } satisfies CliProgram;
    const cli = new Cli(program);
    const result = await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: "INV-1" } },
    });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ format: "pdf", invoice: { id: "INV-1" } });
  });
});
