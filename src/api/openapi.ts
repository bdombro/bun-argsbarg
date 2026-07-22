/*
Hand-built OpenAPI 3.1 document from exposed MCP tools.
*/

import { collectMcpTools } from "../mcp/tools.ts";
import type { CliProgram } from "../types.ts";
import { dereferenceJsonSchema } from "./schema-deref.ts";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/** Resolves the effective API content type for OpenAPI response mapping. */
function effectiveApiContentType(tool: ReturnType<typeof collectMcpTools>[number]): string {
  return tool.leaf.apiResponse?.contentType ?? "application/json";
}

/** Builds an OpenAPI 3.1 response schema for a tool's success payload. */
function buildSuccessResponse(tool: ReturnType<typeof collectMcpTools>[number]): Record<string, unknown> {
  const contentType = effectiveApiContentType(tool);
  const media: Record<string, unknown> = {};

  if (contentType.includes("application/json")) {
    const outputSchema = tool.outputSchema ?? { type: "object" };
    media[contentType] = {
      schema: dereferenceJsonSchema(outputSchema),
    };
  } else if (contentType.includes("text/html")) {
    media[contentType] = { schema: { type: "string" } };
  } else {
    media[contentType] = { schema: { type: "string", format: "binary" } };
  }

  return {
    description: "Successful tool invocation",
    content: media,
  };
}

/** Generates an OpenAPI 3.1 document for the program's exposed tools. */
export function generateOpenApi(program: CliProgram): Record<string, unknown> {
  const tools = collectMcpTools(program);
  const paths: Record<string, unknown> = {};

  for (const tool of tools) {
    const pathKey = `/tools/${tool.apiName}`;
    paths[pathKey] = {
      post: {
        operationId: tool.apiName,
        summary: tool.description,
        requestBody: {
          required: false,
          content: {
            [JSON_CONTENT_TYPE]: {
              schema: dereferenceJsonSchema(tool.inputSchema),
            },
          },
        },
        responses: {
          "200": buildSuccessResponse(tool),
          "400": {
            description: "Invalid arguments or help requested",
            content: {
              [JSON_CONTENT_TYPE]: {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    exitCode: { type: "integer" },
                  },
                  required: ["error"],
                },
              },
            },
          },
          "404": {
            description: "Unknown tool",
            content: {
              [JSON_CONTENT_TYPE]: {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                  required: ["error"],
                },
              },
            },
          },
          "500": {
            description: "Handler error",
            content: {
              [JSON_CONTENT_TYPE]: {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                  required: ["error"],
                },
              },
            },
          },
        },
      },
    };
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
