/*
HTTP API integration tests: routes, tool invocation, CORS, OpenAPI, and validation.
*/

import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { z } from "zod";
import { cliValidateProgram } from "../../core/validate.ts";
import { generateOpenApi } from "../../http/openapi.ts";
import { API_CORS_HEADERS } from "../../http/result.ts";
import { handleApiRequest } from "../../http/server.ts";
import {
  argsbarg,
  type CommandContext as CliContextType,
  CommandContext,
  cliErrWithHelp,
  OptionKind,
  wantsExplicitJson,
} from "../../index.ts";
import { LogEmitter } from "../../log/emitter.ts";
import { createServerRuntime } from "../../server/context.ts";
import { resolveHttpServeConfig } from "../../server/overrides.ts";
import { nestedMcpFixture, runNode, testProgram } from "../fixtures.ts";

/** App spec with HTTP API enabled and handlers that return values. */
function nestedApiFixture() {
  return testProgram({
    ...nestedMcpFixture,
    httpServer: { enabled: true },
    commands: [
      {
        key: "stat",
        description: "File metadata.",
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
                    name: "json",
                    description: "Emit handler output as JSON.",
                    kind: OptionKind.Presence,
                  },
                  {
                    name: "user-name",
                    description: "User to look up.",
                    kind: OptionKind.String,
                    shortName: "u",
                  },
                ],
                positionals: [
                  {
                    name: "path",
                    description: "File or directory.",
                    kind: OptionKind.String,
                  },
                ],
                handler: (ctx: CliContextType) => {
                  const user = ctx.stringOpt("user-name") ?? "unknown";
                  const path = ctx.positional("path") ?? "";
                  if (wantsExplicitJson(ctx, ctx.hasFlag("json"))) {
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
            kind: OptionKind.String,
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
  const cli = argsbarg(program);
  if (opts?.withServer) {
    const resolved = resolveHttpServeConfig(program);
    cli.server = {
      runtime: createServerRuntime(program, "http"),
      emitter: new LogEmitter({
        spec: program,
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
    assert.throws(() => cliValidateProgram(root), /httpServer requires enabled: true/);
  });

  test("rejects top-level command name http when httpServer enabled", () => {
    const root = testProgram({
      key: "app",
      description: "",
      httpServer: { enabled: true },
      commands: [{ key: "http", description: "user", handler: () => {} }],
    });
    assert.throws(() => cliValidateProgram(root), /Reserved command name: http/);
  });

  test("allows top-level command name http without httpServer", () => {
    const root = testProgram({
      key: "app",
      description: "",
      commands: [{ key: "http", description: "user", handler: () => {} }],
    });
    assert.doesNotThrow(() => cliValidateProgram(root));
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
    } as unknown as import("../../core/types.ts").AppSpec;
    assert.throws(() => cliValidateProgram(root), /httpServer is only supported on the app root/);
  });

  test("rejects reserved top-level command when pathPrefix is empty", () => {
    const root = testProgram({
      key: "app",
      description: "",
      httpServer: { enabled: true },
      commands: [{ key: "health", description: "user", handler: () => {} }],
    });
    assert.throws(() => cliValidateProgram(root), /Reserved HTTP command name/);
  });

  test("rejects invalid pathPrefix", () => {
    const root = testProgram({
      key: "app",
      description: "",
      httpServer: { enabled: true, pathPrefix: "api" },
      handler: () => {},
    });
    assert.throws(() => cliValidateProgram(root), /pathPrefix must start with \//);
  });
});

describe("HTTP API routes", () => {
  const program = nestedApiFixture();
  cliValidateProgram(program);

  test("GET /health/liveness returns ok", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/health/liveness"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("GET /health/readiness returns ok when healthy", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/health/readiness"), { withServer: true });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; checks: Record<string, { ok: boolean }> };
    assert.equal(body.ok, true);
    assert.deepEqual(Object.keys(body.checks), ["custom"]);
    assert.equal(body.checks.custom.ok, true);
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
    assert.equal(res.status, 503);
    const body = (await res.json()) as { ok: boolean; checks: { custom: { ok: boolean } } };
    assert.equal(body.ok, false);
    assert.equal(body.checks.custom.ok, false);
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
    assert.equal(res.status, 500);
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
    const cli = argsbarg(throwProgram);
    const resolved = resolveHttpServeConfig(throwProgram);
    cli.server = {
      runtime: createServerRuntime(throwProgram, "http"),
      emitter: new LogEmitter({ spec: throwProgram, resolved: { ...resolved.log, access: false } }),
      http: resolved,
    };
    const res = await handleApiRequest(
      cli,
      new Request("http://127.0.0.1/boom", { method: "POST", body: "{}" }),
      resolved,
    );
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "An unexpected error occurred.");
  });

  test("GET /health/liveness includes CORS headers", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/health/liveness"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("OPTIONS returns 204 with CORS headers", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/stat/owner/lookup", { method: "OPTIONS" }));
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.ok((res.headers.get("access-control-allow-methods") ?? "").includes("POST"));
  });

  test("POST /api/... returns raw JSON body with 201", async () => {
    const readme = join(import.meta.dirname, "..", "..", "..", "README.md");
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/stat/owner/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "user-name": "alice", path: readme, json: true }),
      }),
    );
    assert.equal(res.status, 201);
    assert.ok((res.headers.get("content-type") ?? "").includes("application/json"));
    assert.deepEqual(await res.json(), { user: "alice", path: readme });
  });

  test("POST /api/... returns JSON body by default with 201", async () => {
    const readme = join(import.meta.dirname, "..", "..", "..", "README.md");
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/stat/owner/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "user-name": "alice", path: readme }),
      }),
    );
    assert.equal(res.status, 201);
    assert.ok((res.headers.get("content-type") ?? "").includes("application/json"));
    assert.deepEqual(await res.json(), { user: "alice", path: readme });
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
    assert.equal(res.status, 404);
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
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "%PDF");
  });

  test("POST /api/html returns HTML with 201", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/html", {
        method: "POST",
        body: "{}",
      }),
    );
    assert.equal(res.status, 201);
    assert.ok((res.headers.get("content-type") ?? "").includes("text/html"));
    assert.ok((await res.text()).includes("<!DOCTYPE html>"));
  });

  test("POST /api/silent returns 500 when handler has no response", async () => {
    const res = await apiRequest(
      program,
      new Request("http://127.0.0.1/silent", {
        method: "POST",
        body: "{}",
      }),
    );
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error.includes("ctx.respond()"));
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
    assert.equal(res.status, 404);
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
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error.includes("Missing argument: path"));
    assert.ok(!("stderr" in body));
    assert.ok(!body.error.includes("\u001B["));
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
    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body, { error: "bad input" });
  });

  /** Tests that POST endpoints reject YAML request bodies (JSON only). */
  test("POST rejects YAML request body", async () => {
    const yamlProgram = testProgram({
      key: "app",
      description: "Test app",
      httpServer: { enabled: true },
      commands: [
        {
          key: "create",
          kind: "document",
          description: "Create resource",
          inputSchema: z.object({ name: z.string() }),
          handler: (ctx: CliContextType) => {
            return { created: ctx.inputs.name };
          },
        },
      ],
    });
    cliValidateProgram(yamlProgram);
    const res = await apiRequest(
      yamlProgram,
      new Request("http://127.0.0.1/create", {
        method: "POST",
        headers: { "content-type": "application/yaml" },
        body: "name: test-resource",
      }),
    );
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid JSON body" });
  });

  test("GET /openapi.json lists REST paths", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/openapi.json"));
    assert.equal(res.status, 200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    assert.equal(doc.openapi, "3.1.0");
    assert.notEqual(doc.paths["/stat/owner/lookup"], undefined);
    assert.notEqual(doc.paths["/health/liveness"], undefined);
    assert.notEqual(doc.paths["/health/readiness"], undefined);
    assert.equal(doc.paths["/health"], undefined);
  });

  test("GET /swagger returns Swagger UI HTML", async () => {
    const res = await apiRequest(program, new Request("http://127.0.0.1/swagger"));
    assert.equal(res.status, 200);
    assert.ok((res.headers.get("content-type") ?? "").includes("text/html"));
    const html = await res.text();
    assert.ok(html.includes("swagger-ui-dist"));
    assert.ok(html.includes('url: "/openapi.json"'));
    assert.ok(html.includes('dom_id: "#swagger-ui"'));
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
  assert.equal(
    doc.tags.some((t) => t.name === "health"),
    true,
  );
  assert.equal(doc.paths["/health"], undefined);
  assert.ok((doc.paths["/health/liveness"]?.get.tags ?? []).includes("health"));
  assert.equal(doc.paths["/health/liveness"]?.get.summary, "Liveness probe");
  assert.equal(doc.paths["/health/readiness"]?.get.summary, "Readiness probe");
  assert.notEqual(doc.paths["/health/liveness"]?.get.responses["200"], undefined);
  assert.notEqual(doc.paths["/health/readiness"]?.get.responses["200"], undefined);
  assert.notEqual(doc.paths["/health/readiness"]?.get.responses["503"], undefined);
  const readySchema = doc.paths["/health/readiness"]?.get.responses["200"].content["application/json; charset=utf-8"]
    .schema as { properties?: { checks?: unknown } };
  assert.notEqual(readySchema.properties?.checks, undefined);
});

test("generateOpenApi omits health paths when httpServer disabled", () => {
  const program = testProgram({
    key: "app",
    description: "Test app",
    handler: () => ({ ok: true }),
  });
  cliValidateProgram(program);
  const doc = generateOpenApi(program) as { paths: Record<string, unknown> };
  assert.equal(doc.paths["/health"], undefined);
});

test("generateOpenApi groups routes by top-level command tag", () => {
  const program = nestedApiFixture();
  cliValidateProgram(program);
  const doc = generateOpenApi(program) as {
    tags: { name: string; description?: string }[];
    paths: Record<string, { post?: { tags: string[] }; get?: { tags: string[] } }>;
  };
  const tagNames = doc.tags.map((t) => t.name);
  assert.ok(tagNames.includes("health"));
  assert.ok(tagNames.includes("stat"));
  assert.ok(tagNames.includes("pdf"));
  assert.equal(doc.tags.find((t) => t.name === "stat")?.description, "File metadata.");
  assert.deepEqual(doc.paths["/stat/owner/lookup"]?.post?.tags, ["stat"]);
  assert.deepEqual(doc.paths["/pdf"]?.post?.tags, ["pdf"]);
  assert.deepEqual(doc.paths["/read"]?.post?.tags, ["read"]);
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
  assert.notEqual(doc.paths["/api/echo"], undefined);
  assert.equal(doc.paths["/echo"], undefined);
});

test("generateOpenApi maps binary content types", () => {
  const program = nestedApiFixture();
  const doc = generateOpenApi(program) as {
    paths: Record<string, { post: { responses: { "201": { content: Record<string, unknown> } } } }>;
  };
  const pdf = doc.paths["/pdf"]?.post.responses["201"].content["application/pdf"] as {
    schema: { format: string };
  };
  assert.equal(pdf.schema.format, "binary");
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
        inputSchema: z.object({
          invoice: z.object({ id: z.string() }).meta({ id: "HttpTestInvoiceData" }).optional(),
        }),
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
  assert.ok(!JSON.stringify(schema).includes("$ref"));
  assert.partialDeepStrictEqual(schema.properties.invoice, {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  });
});

test("generateOpenApi generates requestBody for kind: document leaves", () => {
  const program = testProgram({
    key: "app",
    description: "Test app",
    httpServer: { enabled: true },
    commands: [
      {
        key: "render-invoice",
        description: "Render an invoice.",
        kind: "document",
        inputSchema: z.object({ id: z.string() }),
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
  assert.notEqual(op, undefined);
  assert.notEqual(op.requestBody, undefined);
  assert.equal(op.requestBody.required, true);
  assert.deepEqual(op.requestBody.content["application/json; charset=utf-8"].schema, {
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
  const context = new CommandContext("app", [], [], {}, program, "http");
  context.respond({ body: { ok: true } });
  assert.throws(() => context.respond({ body: { ok: true } }), /already called/);
});

test("API_CORS_HEADERS are wide open", () => {
  assert.equal(API_CORS_HEADERS["access-control-allow-origin"], "*");
});

test("ctx.invocation is http via App.invoke", async () => {
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
  const result = await argsbarg(root).invoke([], { invocation: "http" });
  assert.equal(result.kind, "ok");
  assert.equal(seen, "http");
  assert.deepEqual(result.response?.body, { invocation: "http" });
});

test("minimal.ts http without opt-in fails", async () => {
  const { stderr, exitCode } = runNode(["examples/minimal.ts", "http"]);
  assert.equal(exitCode, 1);
  assert.ok(stderr.toString().includes("HTTP API is not available"));
});
