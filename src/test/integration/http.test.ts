/*
HTTP API integration tests: routes, tool invocation, CORS, OpenAPI, and validation.
*/

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { cliValidateProgram } from "~/core/validate.ts";
import { generateOpenApi } from "~/http/openapi.ts";
import { API_CORS_HEADERS } from "~/http/result.ts";
import { handleApiRequest } from "~/http/server.ts";
import { Cli, CliContext, type CliContext as CliContextType, CliOptionKind, cliErrWithHelp } from "~/index";
import { LogEmitter } from "~/log/emitter.ts";
import { createServerRuntime } from "~/server/context.ts";
import { resolveHttpServeConfig } from "~/server/overrides.ts";
import { nestedMcpFixture, testProgram } from "~/test/fixtures.ts";

/** Program with HTTP API enabled and handlers that return values. */
function nestedApiFixture() {
  return testProgram({
    ...nestedMcpFixture,
    httpServer: { enabled: true },
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
        http: { successContentType: "application/pdf" },
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
        http: { successContentType: "text/html; charset=utf-8" },
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
async function apiRequest(
  program: ReturnType<typeof nestedApiFixture>,
  request: Request,
  opts?: { withServer?: boolean },
) {
  const cli = new Cli(program);
  if (opts?.withServer) {
    const resolved = resolveHttpServeConfig(program);
    cli.server = {
      runtime: createServerRuntime(program, "http"),
      emitter: new LogEmitter({
        program,
        resolved: { ...resolved.log, access: false },
      }),
      http: resolved,
    };
  }
  return handleApiRequest(cli, request, cli.server?.http);
}

describe("httpServer validation", () => {
  test("rejects empty httpServer", () => {
    const root = testProgram({
      key: "app",
      description: "",
      httpServer: {} as { enabled: boolean },
      handler: () => {},
    });
    expect(() => cliValidateProgram(root)).toThrow(/httpServer requires enabled: true/);
  });

  test("rejects top-level command name http when httpServer enabled", () => {
    const root = testProgram({
      key: "app",
      description: "",
      httpServer: { enabled: true },
      commands: [{ key: "http", description: "user", handler: () => {} }],
    });
    expect(() => cliValidateProgram(root)).toThrow(/Reserved command name: http/);
  });

  test("allows top-level command name http without httpServer", () => {
    const root = testProgram({
      key: "app",
      description: "",
      commands: [{ key: "http", description: "user", handler: () => {} }],
    });
    expect(() => cliValidateProgram(root)).not.toThrow();
  });

  test("rejects httpServer on non-root node", () => {
    const root = {
      key: "app",
      version: "0.0.0",
      description: "",
      commands: [
        {
          key: "x",
          description: "cmd",
          httpServer: { enabled: true },
          handler: () => {},
        },
      ],
    } as unknown as import("~/core/types.ts").CliProgram;
    expect(() => cliValidateProgram(root)).toThrow(/httpServer is only supported on the program root/);
  });

  test("rejects reserved top-level command when pathPrefix is empty", () => {
    const root = testProgram({
      key: "app",
      description: "",
      httpServer: { enabled: true },
      commands: [{ key: "health", description: "user", handler: () => {} }],
    });
    expect(() => cliValidateProgram(root)).toThrow(/Reserved HTTP command name/);
  });

  test("rejects invalid pathPrefix", () => {
    const root = testProgram({
      key: "app",
      description: "",
      httpServer: { enabled: true, pathPrefix: "api" },
      handler: () => {},
    });
    expect(() => cliValidateProgram(root)).toThrow(/pathPrefix must start with \//);
  });
});

describe("HTTP API routes", () => {
  const program = nestedApiFixture();
  cliValidateProgram(program);

  test("GET /health/liveness returns ok", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/health/liveness"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("GET /health/readiness returns ok when healthy", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/health/readiness"), { withServer: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; checks: Record<string, { ok: boolean }> };
    expect(body.ok).toBe(true);
    expect(body.checks.config_file.ok).toBe(true);
    expect(body.checks.config_required.ok).toBe(true);
  });

  test("GET /health/readiness returns 503 when custom readiness fails", async () => {
    const failProgram = testProgram({
      key: "app",
      description: "Test",
      version: "1.0.0",
      httpServer: { enabled: true },
      readiness: () => false,
      handler: () => ({ ok: true }),
    });
    cliValidateProgram(failProgram);
    const res = await apiRequest(failProgram, new Request("http://127.0.0.1/health/readiness"), { withServer: true });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; checks: { custom: { ok: boolean } } };
    expect(body.ok).toBe(false);
    expect(body.checks.custom.ok).toBe(false);
  });

  test("POST /api returns 500 for non-Error throw", async () => {
    const throwProgram = testProgram({
      key: "app",
      description: "Test",
      httpServer: { enabled: true },
      commands: [
        {
          key: "boom",
          description: "Throws non-Error",
          handler: () => {
            throw "unexpected";
          },
        },
      ],
    });
    cliValidateProgram(throwProgram);
    const res = await apiRequest(throwProgram, new Request("http://127.0.0.1/boom", { method: "POST", body: "{}" }));
    expect(res.status).toBe(500);
  });

  test("POST /api obscures unexpected errors when configured", async () => {
    const throwProgram = testProgram({
      key: "app",
      description: "Test",
      httpServer: { enabled: true, errors: { obscureUnexpected: true } },
      commands: [
        {
          key: "boom",
          description: "Throws non-Error",
          handler: () => {
            throw "secret";
          },
        },
      ],
    });
    cliValidateProgram(throwProgram);
    const cli = new Cli(throwProgram);
    const resolved = resolveHttpServeConfig(throwProgram);
    cli.server = {
      runtime: createServerRuntime(throwProgram, "http"),
      emitter: new LogEmitter({ program: throwProgram, resolved: { ...resolved.log, access: false } }),
      http: resolved,
    };
    const res = await handleApiRequest(
      cli,
      new Request("http://127.0.0.1/boom", { method: "POST", body: "{}" }),
      resolved,
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("An unexpected error occurred.");
  });

  test("GET /health/liveness includes CORS headers", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/health/liveness"));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ ok: true });
  });

  test("OPTIONS returns 204 with CORS headers", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/stat/owner/lookup", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("POST /api/... returns raw JSON body with 201", async () => {
    const readme = join(import.meta.dir, "..", "..", "..", "README.md");
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/stat/owner/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "user-name": "alice", path: readme, json: true }),
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ user: "alice", path: readme });
  });

  test("POST /api/... returns raw text body with 201", async () => {
    const readme = join(import.meta.dir, "..", "..", "..", "README.md");
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/stat/owner/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "user-name": "alice", path: readme }),
      }),
    );
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).toContain("lookup user=alice");
  });

  test("POST /tools returns 404 (legacy path removed)", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(404);
  });

  test("POST /api/pdf returns PDF bytes with 201", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });

  test("POST /api/html returns HTML with 201", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/html", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<!DOCTYPE html>");
  });

  test("POST /api/silent returns 500 when handler has no response", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/silent", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ctx.respond()");
  });

  test("POST /api returns 404 for unknown route", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/missing_tool", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(404);
  });

  test("POST /api returns 400 for bad args", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/stat/owner/lookup", {
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

  test("POST /api/... returns plain JSON validation errors", async () => {
    const failProgram = testProgram({
      key: "app",
      description: "Test app",
      httpServer: { enabled: true },
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
      new Request("http://127.0.0.1/fail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "bad input" });
  });

  test("GET /openapi.json lists REST paths", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/openapi.json"));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/stat/owner/lookup"]).toBeDefined();
    expect(doc.paths["/health/liveness"]).toBeDefined();
    expect(doc.paths["/health/readiness"]).toBeDefined();
    expect(doc.paths["/health"]).toBeUndefined();
  });

  test("GET /swagger returns Swagger UI HTML", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/swagger"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("swagger-ui-dist");
    expect(html).toContain('url: "/openapi.json"');
    expect(html).toContain('dom_id: "#swagger-ui"');
  });
});

test("generateOpenApi includes health probe paths", () => {
  const program = testProgram({
    key: "app",
    description: "Test app",
    httpServer: { enabled: true },
    handler: () => ({ ok: true }),
  });
  cliValidateProgram(program);
  const doc = generateOpenApi(program) as {
    tags: { name: string }[];
    paths: Record<
      string,
      {
        get: {
          tags: string[];
          summary: string;
          responses: Record<string, { content: Record<string, { schema: Record<string, unknown> }> }>;
        };
      }
    >;
  };
  expect(doc.tags.some((t) => t.name === "health")).toBe(true);
  expect(doc.paths["/health"]).toBeUndefined();
  expect(doc.paths["/health/liveness"]?.get.tags).toContain("health");
  expect(doc.paths["/health/liveness"]?.get.summary).toBe("Liveness probe");
  expect(doc.paths["/health/readiness"]?.get.summary).toBe("Readiness probe");
  expect(doc.paths["/health/liveness"]?.get.responses["200"]).toBeDefined();
  expect(doc.paths["/health/readiness"]?.get.responses["200"]).toBeDefined();
  expect(doc.paths["/health/readiness"]?.get.responses["503"]).toBeDefined();
  const readySchema = doc.paths["/health/readiness"]?.get.responses["200"].content["application/json; charset=utf-8"]
    .schema as { properties?: { checks?: unknown } };
  expect(readySchema.properties?.checks).toBeDefined();
});

test("generateOpenApi omits health paths when httpServer disabled", () => {
  const program = testProgram({
    key: "app",
    description: "Test app",
    handler: () => ({ ok: true }),
  });
  cliValidateProgram(program);
  const doc = generateOpenApi(program) as { paths: Record<string, unknown> };
  expect(doc.paths["/health"]).toBeUndefined();
});

test("generateOpenApi groups routes by top-level command tag", () => {
  const program = nestedApiFixture();
  cliValidateProgram(program);
  const doc = generateOpenApi(program) as {
    tags: { name: string; description?: string }[];
    paths: Record<string, { post?: { tags: string[] }; get?: { tags: string[] } }>;
  };
  const tagNames = doc.tags.map((t) => t.name);
  expect(tagNames).toContain("health");
  expect(tagNames).toContain("stat");
  expect(tagNames).toContain("pdf");
  expect(doc.tags.find((t) => t.name === "stat")?.description).toBe("File metadata.");
  expect(doc.paths["/stat/owner/lookup"]?.post?.tags).toEqual(["stat"]);
  expect(doc.paths["/pdf"]?.post?.tags).toEqual(["pdf"]);
  expect(doc.paths["/read"]?.post?.tags).toEqual(["read"]);
});

test("generateOpenApi honors httpServer.pathPrefix", () => {
  const program = testProgram({
    key: "app",
    description: "Test app",
    httpServer: { enabled: true, pathPrefix: "/api" },
    commands: [{ key: "echo", description: "Echo.", handler: () => ({ ok: true }) }],
  });
  cliValidateProgram(program);
  const doc = generateOpenApi(program) as { paths: Record<string, unknown> };
  expect(doc.paths["/api/echo"]).toBeDefined();
  expect(doc.paths["/echo"]).toBeUndefined();
});

test("generateOpenApi maps binary content types", () => {
  const program = nestedApiFixture();
  const doc = generateOpenApi(program) as {
    paths: Record<string, { post: { responses: { "201": { content: Record<string, unknown> } } } }>;
  };
  const pdf = doc.paths["/pdf"]?.post.responses["201"].content["application/pdf"] as {
    schema: { format: string };
  };
  expect(pdf.schema.format).toBe("binary");
});

test("generateOpenApi dereferences nested inputSchema definitions", () => {
  const program = testProgram({
    key: "app",
    description: "Test app",
    httpServer: { enabled: true },
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
  const schema = doc.paths["/render"]?.post.requestBody.content["application/json; charset=utf-8"].schema;
  expect(schema.properties.invoice).toEqual({
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  });
});

test("generateOpenApi generates requestBody for kind: json leaves", () => {
  const program = testProgram({
    key: "app",
    description: "Test app",
    httpServer: { enabled: true },
    commands: [
      {
        key: "render-invoice",
        description: "Render an invoice.",
        kind: "json",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
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
            required: boolean;
            content: Record<string, { schema: Record<string, unknown> }>;
          };
        };
      }
    >;
  };
  const op = doc.paths["/render-invoice"]?.post;
  expect(op).toBeDefined();
  expect(op.requestBody).toBeDefined();
  expect(op.requestBody.required).toBe(true);
  expect(op.requestBody.content["application/json; charset=utf-8"].schema).toEqual({
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
  const context = new CliContext("app", [], [], {}, program, "http");
  context.respond({ body: { ok: true } });
  expect(() => context.respond({ body: { ok: true } })).toThrow(/already called/);
});

test("API_CORS_HEADERS are wide open", () => {
  expect(API_CORS_HEADERS["access-control-allow-origin"]).toBe("*");
});

test("ctx.invocation is http via Cli.invoke", async () => {
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
  const result = await new Cli(root).invoke([], { invocation: "http" });
  expect(result.kind).toBe("ok");
  expect(seen).toBe("http");
  expect(result.response?.body).toEqual({ invocation: "http" });
});

test("minimal.ts http without opt-in fails", async () => {
  const { stderr, exitCode } = await $`bun run examples/minimal.ts http`.nothrow().quiet();
  expect(exitCode).toBe(1);
  expect(stderr.toString()).toContain("HTTP API is not available");
});
