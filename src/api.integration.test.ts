/*
HTTP API integration tests: routes, tool invocation, CORS, OpenAPI, and validation.
*/

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { generateOpenApi } from "./api/openapi.ts";
import { API_CORS_HEADERS } from "./api/result.ts";
import { handleApiRequest } from "./api/server.ts";
import { Cli, CliContext, type CliContext as CliContextType, CliOptionKind, cliErrWithHelp } from "./index.ts";
import { nestedMcpFixture, testProgram } from "./test-fixtures.ts";
import { cliValidateProgram } from "./validate.ts";

/** Program with HTTP API enabled and handlers that return values. */
function nestedApiFixture() {
  return testProgram({
    ...nestedMcpFixture,
    apiServer: { enabled: true },
    commands: [
      {
        key: "stat",
        description: "File metadata.",
        options: [
          {
            name: "json",
            description: "Emit handler output as JSON.",
            kind: CliOptionKind.Presence,
          },
        ],
        commands: [
          {
            key: "owner",
            description: "Ownership helpers.",
            commands: [
              {
                key: "lookup",
                description: "Resolve owner info.",
                options: [
                  {
                    name: "user-name",
                    description: "User to look up.",
                    kind: CliOptionKind.String,
                    shortName: "u",
                  },
                ],
                positionals: [
                  {
                    name: "path",
                    description: "File or directory.",
                    kind: CliOptionKind.String,
                  },
                ],
                handler: (ctx: CliContextType) => {
                  const user = ctx.stringOpt("user-name") ?? "unknown";
                  const path = ctx.positional("path") ?? "";
                  if (ctx.hasFlag("json")) {
                    return { user, path };
                  }
                  return `lookup user=${user} path=${path}`;
                },
              },
            ],
          },
        ],
      },
      {
        key: "read",
        description: "Print the first line of each file.",
        positionals: [
          {
            name: "files",
            description: "Paths to read.",
            kind: CliOptionKind.String,
            argMax: 0,
          },
        ],
        handler: () => ({ lines: [] }),
      },
      {
        key: "pdf",
        description: "Return a minimal PDF.",
        apiResponse: { contentType: "application/pdf" },
        handler: (ctx: CliContextType) => {
          ctx.respond({
            body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
            contentType: "application/pdf",
          });
        },
      },
      {
        key: "html",
        description: "Return HTML.",
        apiResponse: { contentType: "text/html; charset=utf-8" },
        handler: (ctx: CliContextType) => {
          ctx.respond({
            body: "<!DOCTYPE html><html><body>hi</body></html>",
            contentType: "text/html; charset=utf-8",
          });
        },
      },
      {
        key: "silent",
        description: "Returns nothing.",
        handler: () => {},
      },
    ],
  });
}

/** Sends one HTTP request through the in-process API handler. */
async function apiRequest(program: ReturnType<typeof nestedApiFixture>, request: Request) {
  const cli = new Cli(program);
  return handleApiRequest(cli, request);
}

describe("apiServer validation", () => {
  test("rejects empty apiServer", () => {
    const root = testProgram({
      key: "app",
      description: "",
      apiServer: {} as { enabled: boolean },
      handler: () => {},
    });
    expect(() => cliValidateProgram(root)).toThrow(/apiServer requires enabled: true/);
  });

  test("rejects top-level command name api when apiServer enabled", () => {
    const root = testProgram({
      key: "app",
      description: "",
      apiServer: { enabled: true },
      commands: [{ key: "api", description: "user", handler: () => {} }],
    });
    expect(() => cliValidateProgram(root)).toThrow(/Reserved command name: api/);
  });

  test("allows top-level command name api without apiServer", () => {
    const root = testProgram({
      key: "app",
      description: "",
      commands: [{ key: "api", description: "user", handler: () => {} }],
    });
    expect(() => cliValidateProgram(root)).not.toThrow();
  });

  test("rejects apiServer on non-root node", () => {
    const root = {
      key: "app",
      version: "0.0.0",
      description: "",
      commands: [
        {
          key: "x",
          description: "cmd",
          apiServer: { enabled: true },
          handler: () => {},
        },
      ],
    } as unknown as import("./types.ts").CliProgram;
    expect(() => cliValidateProgram(root)).toThrow(/apiServer is only supported on the program root/);
  });
});

describe("HTTP API routes", () => {
  const program = nestedApiFixture();
  cliValidateProgram(program);

  test("GET /health includes CORS headers", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ ok: true });
  });

  test("OPTIONS returns 204 with CORS headers", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools/stat-owner-lookup", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("POST /tools/:name returns raw JSON body", async () => {
    const readme = join(import.meta.dir, "..", "README.md");
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools/stat-owner-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "user-name": "alice", path: readme, json: true }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ user: "alice", path: readme });
  });

  test("POST /tools/:name returns raw text body", async () => {
    const readme = join(import.meta.dir, "..", "README.md");
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools/stat-owner-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "user-name": "alice", path: readme }),
      }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("lookup user=alice");
  });

  test("POST /tools returns 405", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(405);
  });

  test("POST /tools/:name returns PDF bytes", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });

  test("POST /tools/:name returns HTML", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools/html", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<!DOCTYPE html>");
  });

  test("POST /tools/:name returns 500 when handler has no response", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools/silent", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ctx.respond()");
  });

  test("POST /tools returns 404 for unknown tool", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools/missing_tool", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(404);
  });

  test("POST /tools returns 400 for bad args", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools/stat-owner-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "user-name": "alice" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Missing argument: path");
    expect(body).not.toHaveProperty("stderr");
    expect(body.error).not.toContain("\u001B[");
  });

  test("POST /tools/:name returns plain JSON validation errors", async () => {
    const failProgram = testProgram({
      key: "app",
      description: "Test app",
      apiServer: { enabled: true },
      commands: [
        {
          key: "fail",
          description: "Fails with cliErrWithHelp.",
          handler: (ctx: CliContextType) => {
            cliErrWithHelp(ctx, "bad input");
          },
        },
      ],
    });
    cliValidateProgram(failProgram);
    const res = await apiRequest(
      failProgram,
      new Request("http://127.0.0.1/tools/fail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "bad input" });
  });

  test("GET /openapi.json lists tool paths", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/openapi.json"));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/tools/stat-owner-lookup"]).toBeDefined();
  });

  test("GET /openapi-browser returns Scalar HTML", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/openapi-browser"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("@scalar/api-reference");
    expect(html).toContain('orderSchemaPropertiesBy: "preserve"');
    expect(html).toContain("orderRequiredPropertiesFirst: false");
  });
});

test("generateOpenApi maps binary content types", () => {
  const program = nestedApiFixture();
  const doc = generateOpenApi(program) as {
    paths: Record<string, { post: { responses: { "200": { content: Record<string, unknown> } } } }>;
  };
  const pdf = doc.paths["/tools/pdf"]?.post.responses["200"].content["application/pdf"] as {
    schema: { format: string };
  };
  expect(pdf.schema.format).toBe("binary");
});

test("generateOpenApi dereferences nested inputSchema definitions", () => {
  const program = testProgram({
    key: "app",
    description: "Test app",
    apiServer: { enabled: true },
    commands: [
      {
        key: "render",
        description: "Render a document.",
        inputSchema: {
          type: "object",
          properties: {
            invoice: { $ref: "#/definitions/InvoiceData" },
          },
          definitions: {
            InvoiceData: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
          },
        },
        handler: () => ({ ok: true }),
      },
    ],
  });
  cliValidateProgram(program);
  const doc = generateOpenApi(program) as {
    paths: Record<
      string,
      {
        post: {
          requestBody: {
            content: Record<string, { schema: { properties: { invoice: Record<string, unknown> } } }>;
          };
        };
      }
    >;
  };
  const schema = doc.paths["/tools/render"]?.post.requestBody.content["application/json; charset=utf-8"].schema;
  expect(schema.properties.invoice).toEqual({
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  });
});

test("ctx.respond throws when called twice", () => {
  const program = testProgram({
    key: "app",
    description: "",
    handler: () => {},
  });
  const context = new CliContext("app", [], [], {}, program, "api");
  context.respond({ body: { ok: true } });
  expect(() => context.respond({ body: { ok: true } })).toThrow(/already called/);
});

test("API_CORS_HEADERS are wide open", () => {
  expect(API_CORS_HEADERS["access-control-allow-origin"]).toBe("*");
});

test("ctx.invocation is api via Cli.invoke", async () => {
  let seen = "";
  const root = testProgram({
    key: "app",
    description: "",
    handler: (ctx: CliContextType) => {
      seen = ctx.invocation;
      return { invocation: ctx.invocation };
    },
  });
  cliValidateProgram(root);
  const result = await new Cli(root).invoke([], { invocation: "api" });
  expect(result.kind).toBe("ok");
  expect(seen).toBe("api");
  expect(result.response?.body).toEqual({ invocation: "api" });
});

test("minimal.ts api without opt-in fails", async () => {
  const { stderr, exitCode } = await $`bun run examples/minimal.ts api`.nothrow().quiet();
  expect(exitCode).toBe(1);
  expect(stderr.toString()).toContain("HTTP API is not available");
});
