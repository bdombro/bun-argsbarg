/*
Hand-built OpenAPI 3.1 document from exposed HTTP REST routes.
*/

import { collectOptionDefs } from "~/core/parse.ts";
import type { CliHttpMethod, CliProgram } from "~/core/types.ts";
import { CliOptionKind, isJsonLeaf } from "~/core/types.ts";
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

/** Generates an OpenAPI 3.1 document for the program's HTTP routes. */
export function generateOpenApi(program: CliProgram): Record<string, unknown> {
  const routes = collectHttpRoutes(program);
  const paths: Record<string, unknown> = {};

  for (const route of routes) {
    const pathKey = route.openApiPath;
    const existing = (paths[pathKey] as Record<string, unknown> | undefined) ?? {};
    const op: Record<string, unknown> = {
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
    } else if (!isJsonLeaf(route.leaf)) {
      op.requestBody = {
        required: false,
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
    paths,
  };
}

/** Pretty-printed OpenAPI JSON (same document as `GET /openapi.json`). */
export function openApiJson(program: CliProgram): string {
  return `${JSON.stringify(generateOpenApi(program), null, 2)}\n`;
}
