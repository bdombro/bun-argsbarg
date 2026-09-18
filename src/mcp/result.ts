/*
This module builds MCP tools/call success results from handler respond payloads.
*/

import { encodeRespondBodyBase64 } from "../core/respond.ts";
import type { CliRespondOptions } from "../core/types.ts";

/** Text content block in an MCP tool result. */
export interface McpTextContent {
  type: "text";
  text: string;
}

/** Successful MCP tools/call result payload. */
export interface McpToolCallSuccess {
  content: McpTextContent[];
  structuredContent?: unknown;
  isError: false;
}

/** Canonical MCP structuredContent for string respond bodies. */
export interface McpStringRespondContent {
  content: string;
  contentType: string;
}

/** Canonical MCP structuredContent for binary respond bodies. */
export interface McpBinaryRespondContent {
  data: string;
  contentType: string;
  encoding: "base64";
}

/**
 * Builds a successful tools/call result from a headless respond payload.
 * Binary bodies are encoded as base64 in structuredContent.
 */
export function buildToolCallSuccessFromResponse(response: CliRespondOptions): McpToolCallSuccess {
  const { body, contentType = "application/json; charset=utf-8" } = response;
  let structuredContent: unknown;
  let text = "";

  if (body instanceof Uint8Array) {
    structuredContent = {
      data: encodeRespondBodyBase64(body),
      contentType,
      encoding: "base64",
    } satisfies McpBinaryRespondContent;
    text = `[Binary data: ${contentType}, ${body.length} bytes]`;
  } else if (typeof body === "string") {
    structuredContent = {
      content: body,
      contentType,
    } satisfies McpStringRespondContent;
    text = body;
  } else {
    structuredContent = body;
    text = typeof body === "object" && body !== null ? JSON.stringify(body, null, 2) : String(body ?? "");
  }

  return {
    content: [{ type: "text", text }],
    structuredContent,
    isError: false,
  };
}
