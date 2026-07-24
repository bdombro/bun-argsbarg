/*
Hand-built OpenAPI 3.1 document from exposed HTTP REST routes.
*/

import { collectOptionDefs } from "../core/parse.ts";
import type { CliHttpMethod, CliNode, CliProgram } from "../core/types.ts";
import { CliOptionKind, isCliLeaf, isJsonLeaf } from "../core/types.ts";
import { collectHttpRoutes, defaultSuccessStatus } from "./routes.ts";
import { dereferenceJsonSchema } from "./schema-deref.ts";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function defaultErrorSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: { error: { type: "string" } },
    required: ["error"],
  };
}

function errorResponseSchema(program: CliProgram): Record<string, unknown> {
  const custom = program.httpServer?.errors?.errorSchema;
  return custom ? dereferenceJsonSchema(custom) : defaultErrorSchema();
}

function errorResponseEntry(program: CliProgram, description: string): Record<string, unknown> {
  return {
    description,
    content: {
      [JSON_CONTENT_TYPE]: {
        schema: errorResponseSchema(program),
      },
    },
  };
}

function buildInputSchema(
  program: CliProgram,
  route: ReturnType<typeof collectHttpRoutes>[number],
): Record<string, unknown> {
  const leaf = route.leaf;
  if (leaf.inputSchema) {
    return leaf.inputSchema;
  }
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of route.paramNames) {
    properties[p] = { type: "string" };
    required.push(p);
  }
  const argv = route.commandPath.filter((k) => !k.startsWith(":"));
  for (const opt of collectOptionDefs(program, argv)) {
    if (opt.kind === CliOptionKind.Json) {
      continue;
    }
    properties[opt.name] = { type: "string", description: opt.description };
    if (opt.required) {
      required.push(opt.name);
    }
  }
  for (const p of leaf.positionals ?? []) {
    properties[p.name] = { type: "string", description: p.description };
    if ((p.argMin ?? 1) >= 1) {
      required.push(p.name);
    }
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/** Builds success response entries for OpenAPI (status → response object). */
function buildSuccessResponses(route: ReturnType<typeof collectHttpRoutes>[number]): Record<string, unknown> {
  const contentType = route.leaf.http?.successContentType ?? "application/json";
  const media: Record<string, unknown> = {};
  const method = route.method;

  if (contentType.includes("application/json")) {
    const outputSchema = route.leaf.outputSchema ?? { type: "object" };
    media[contentType] = {
      schema: dereferenceJsonSchema(outputSchema),
    };
  } else if (contentType.includes("text/html")) {
    media[contentType] = { schema: { type: "string" } };
  } else {
    media[contentType] = { schema: { type: "string", format: "binary" } };
  }

  const status = String(route.leaf.http?.successStatus ?? defaultSuccessStatus(method, method !== "DELETE"));
  if (method === "DELETE" && status === "204") {
    return {
      "204": { description: "Successful invocation" },
    };
  }
  return {
    [status]: {
      description: "Successful invocation",
      content: media,
    },
  };
}

function methodLower(method: CliHttpMethod): string {
  return method.toLowerCase();
}

const HEALTH_TAG = "health";

const livenessResponseSchema = {
  type: "object",
  properties: { ok: { type: "boolean", const: true } },
  required: ["ok"],
} as const;

const readinessCheckSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    error: { type: "string" },
    missing: { type: "array", items: { type: "string" } },
  },
  required: ["ok"],
} as const;

const readinessResponseSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    checks: {
      type: "object",
      properties: {
        config_file: readinessCheckSchema,
        config_required: readinessCheckSchema,
        custom: readinessCheckSchema,
      },
      required: ["config_file", "config_required", "custom"],
    },
  },
  required: ["ok", "checks"],
} as const;

function jsonResponseEntry(description: string, schema: Record<string, unknown>): Record<string, unknown> {
  return {
    description,
    content: {
      [JSON_CONTENT_TYPE]: { schema },
    },
  };
}

function livenessGetOp(): Record<string, unknown> {
  return {
    tags: [HEALTH_TAG],
    operationId: "health_liveness",
    summary: "Liveness probe",
    description:
      "Returns 200 when the HTTP server is online and accepting requests. Does not run config or readiness checks — use for orchestrator liveness probes only.",
    responses: {
      "200": jsonResponseEntry("Server is online", livenessResponseSchema),
    },
  };
}

/** Framework health probe paths served alongside user command routes. */
function buildHealthPaths(): Record<string, unknown> {
  return {
    "/health/liveness": {
      get: livenessGetOp(),
    },
    "/health/readiness": {
      get: {
        tags: [HEALTH_TAG],
        operationId: "health_readiness",
        summary: "Readiness probe",
        description:
          "Returns 200 when the server is online and all readiness checks pass (config file, required app config, and optional program.readiness). Returns 503 when any check fails — use for orchestrator readiness probes before routing traffic.",
        responses: {
          "200": jsonResponseEntry("Online and ready to serve traffic", readinessResponseSchema),
          "503": jsonResponseEntry("Online but not ready (one or more checks failed)", readinessResponseSchema),
        },
      },
    },
  };
}

type HttpRoute = ReturnType<typeof collectHttpRoutes>[number];

/** Top-level command key for OpenAPI grouping (first non-`:param` segment). */
function topLevelCommandKey(route: HttpRoute, program: CliProgram): string {
  const key = route.commandPath.find((k) => !k.startsWith(":"));
  return key ?? program.key;
}

function findTopLevelCommand(program: CliProgram, key: string): CliNode | undefined {
  if (isCliLeaf(program)) {
    return program.key === key ? program : undefined;
  }
  return program.commands.find((c) => c.key === key);
}

/** OpenAPI tags for user command routes, one per top-level command. */
function collectCommandTags(program: CliProgram, routes: HttpRoute[]): { name: string; description?: string }[] {
  const names = [...new Set(routes.map((route) => topLevelCommandKey(route, program)))].sort();
  return names.map((name) => {
    const node = findTopLevelCommand(program, name);
    return node?.description ? { name, description: node.description } : { name };
  });
}

/** Generates an OpenAPI 3.1 document for the program's HTTP routes. */
export function generateOpenApi(program: CliProgram): Record<string, unknown> {
  const routes = collectHttpRoutes(program);
  const paths: Record<string, unknown> = program.httpServer?.enabled ? buildHealthPaths() : {};
  const commandTags = collectCommandTags(program, routes);

  for (const route of routes) {
    const pathKey = route.openApiPath;
    const existing = (paths[pathKey] as Record<string, unknown> | undefined) ?? {};
    const op: Record<string, unknown> = {
      tags: [topLevelCommandKey(route, program)],
      operationId: route.openApiPath.replace(/\//g, "_").replace(/[{}]/g, ""),
      summary: route.leaf.description ?? route.leaf.key,
      responses: {
        ...buildSuccessResponses(route),
        "400": errorResponseEntry(program, "Invalid arguments or help requested"),
        "404": errorResponseEntry(program, "Not found"),
        "500": errorResponseEntry(program, "Handler error"),
        "503": errorResponseEntry(program, "Not ready or missing required config"),
      },
    };

    if (route.paramNames.length > 0) {
      op.parameters = route.paramNames.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      }));
    }

    const method = methodLower(route.method);
    if (method === "get" || method === "delete") {
      op.parameters = [
        ...((op.parameters as unknown[]) ?? []),
        ...collectOptionDefs(
          program,
          route.commandPath.filter((k) => !k.startsWith(":")),
        ).map((opt) => ({
          name: opt.name,
          in: "query",
          required: opt.required ?? false,
          schema: { type: "string" },
          description: opt.description,
        })),
      ];
    } else {
      op.requestBody = {
        required: isJsonLeaf(route.leaf),
        content: {
          [JSON_CONTENT_TYPE]: {
            schema: dereferenceJsonSchema(buildInputSchema(program, route)),
          },
        },
      };
    }

    existing[method] = op;
    paths[pathKey] = existing;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: program.key,
      version: program.version,
      description: program.description,
    },
    ...(program.httpServer?.enabled
      ? {
          tags: [
            {
              name: HEALTH_TAG,
              description: "Orchestrator health probes — liveness (online) vs readiness (online + checks passed).",
            },
            ...commandTags,
          ],
        }
      : {}),
    paths,
  };
}

/** Pretty-printed OpenAPI JSON (same document as `GET /openapi.json`). */
export function openApiJson(program: CliProgram): string {
  return `${JSON.stringify(generateOpenApi(program), null, 2)}\n`;
}
