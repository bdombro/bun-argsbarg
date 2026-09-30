import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import { argsbarg, CommandContext, OptionKind } from "../index.ts";
import { InputError, loadLeafInputs } from "./leaf-inputs.ts";
import type { AppSpec } from "./types.ts";

/** Zod schema for the invoice render inputs. */
const invoiceSchema = z.strictObject({
  format: z.enum(["pdf", "html"]),
  invoice: z.strictObject({ id: z.string() }),
});

function renderProgram(): AppSpec {
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
            kind: OptionKind.Enum,
            choices: ["pdf", "html"],
            required: true,
          },
          {
            name: "invoice",
            description: "Invoice JSON (flag or stdin)",
            kind: OptionKind.Json,
            pipable: true,
            required: true,
          },
        ],
        handler: (ctx) => ctx.inputs,
      },
    ],
  } satisfies AppSpec;
}

describe("loadLeafInputs / jsonOpt", () => {
  test("reads Json option from MCP toolArgs", async () => {
    const cli = argsbarg(renderProgram());
    const result = await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: "INV-1" } },
    });
    assert.equal(result.kind, "ok");
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.response?.body, {
      format: "pdf",
      invoice: { id: "INV-1" },
    });
  });

  test("flag wins over toolArgs for Json option", async () => {
    const cli = argsbarg(renderProgram());
    const result = await cli.invoke(["render", "--format", "pdf", "--invoice", '{"id":"from-flag"}'], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: "from-tool-args" } },
    });
    assert.equal(result.kind, "ok");
    assert.deepEqual(result.response?.body, {
      format: "pdf",
      invoice: { id: "from-flag" },
    });
  });

  test("jsonOpt reads from preloadedJson", () => {
    const program = renderProgram();
    const ctx = new CommandContext("json-pipe-test", ["render"], [], { format: "pdf" }, program, "cli", undefined, {
      invoice: { id: "piped" },
    });
    assert.deepEqual(ctx.jsonOpt("invoice"), { id: "piped" });
    assert.deepEqual(ctx.inputs, { format: "pdf", invoice: { id: "piped" } });
  });

  test("inputs returns the parsed inputs", () => {
    const program = renderProgram();
    const ctx = new CommandContext("json-pipe-test", ["render"], [], { format: "pdf" }, program, "mcp", undefined, {
      format: "pdf",
      invoice: { id: "INV-1" },
    });
    assert.deepEqual(ctx.inputs, { format: "pdf", invoice: { id: "INV-1" } });
  });

  test("rejects invalid Json flag at parse time", async () => {
    const cli = argsbarg(renderProgram());
    const result = await cli.invoke(["render", "--format", "pdf", "--invoice", "not-json"], {
      invocation: "mcp",
      toolArgs: {},
    });
    assert.equal(result.kind, "error");
    assert.ok((result.errorMsg ?? "").includes("Invalid JSON"));
  });

  test("validates merged inputs against inputSchema", async () => {
    const cli = argsbarg(renderProgram());
    const result = await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: 123 } },
    });
    assert.equal(result.kind, "error");
    assert.ok(result.stderr.includes("invoice.id"));
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
              kind: OptionKind.Enum,
              choices: ["pdf", "html"],
              required: true,
            },
            {
              name: "invoice",
              description: "Invoice JSON",
              kind: OptionKind.Json,
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
    } satisfies AppSpec;
    const cli = argsbarg(program);
    const result = await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: 123 } },
    });
    assert.equal(result.kind, "error");
    assert.equal(handlerCalled, false);
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
              kind: OptionKind.Enum,
              choices: ["pdf", "html"],
              required: true,
            },
            {
              name: "invoice",
              description: "Invoice JSON",
              kind: OptionKind.Json,
              required: true,
            },
          ],
          handler: (ctx) => {
            inputs.push(ctx.inputs);
            inputs.push(ctx.inputs);
          },
        },
      ],
    } satisfies AppSpec;
    const cli = argsbarg(program);
    await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: "INV-1" } },
    });
    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs[0], inputs[1]);
  });

  test("loadLeafInputs throws InputError when required Json is missing", () => {
    const program = renderProgram();
    const ctx = new CommandContext("json-pipe-test", ["render"], [], { format: "pdf" }, program, "mcp", undefined, {});
    assert.throws(() => loadLeafInputs(ctx), InputError);
  });

  test("omits undefined optional properties before inputSchema validation", async () => {
    const schemaWithOptional = z.strictObject({
      format: z.enum(["pdf", "html"]),
      template: z.string().optional(),
      invoice: z.strictObject({ id: z.string() }),
    });
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
              kind: OptionKind.Enum,
              choices: ["pdf", "html"],
              required: true,
            },
            {
              name: "template",
              description: "Template name",
              kind: OptionKind.String,
            },
            {
              name: "invoice",
              description: "Invoice JSON",
              kind: OptionKind.Json,
              pipable: true,
              required: true,
            },
          ],
          handler: (ctx) => ctx.inputs,
        },
      ],
    } satisfies AppSpec;
    const cli = argsbarg(program);
    const result = await cli.invoke(["render", "--format", "pdf"], {
      invocation: "mcp",
      toolArgs: { format: "pdf", invoice: { id: "INV-1" } },
    });
    assert.equal(result.kind, "ok");
    assert.deepEqual(result.response?.body, { format: "pdf", invoice: { id: "INV-1" } });
  });
});
