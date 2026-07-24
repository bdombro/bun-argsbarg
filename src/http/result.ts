/*
Maps headless respond payloads to native HTTP Response objects.
*/

import type { CliHttpResponseConfig, CliRespondOptions } from "~/core/types.ts";

/** JSON body for a failed HTTP tool invocation. */
export interface ApiToolCallErrorBody {
  error: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

/** Strips ANSI escape sequences from CLI-formatted text. */
export function stripAnsi(text: string): string {
  const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  return text.replace(ansiEscape, "");
}

/** Returns the first non-empty line of text with ANSI escapes removed. */
export function firstErrorLine(text: string): string {
  const line = stripAnsi(text)
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return line ?? stripAnsi(text).trim();
}

/** Wide-open CORS headers applied to all API responses. */
export const API_CORS_HEADERS: Readonly<Record<string, string>> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
  "access-control-max-age": "86400",
};

/** Builds a 204 OPTIONS preflight response with CORS headers. */
export function apiOptionsResponse(): Response {
  return new Response(null, { status: 204, headers: { ...API_CORS_HEADERS } });
}

/** Resolves effective Content-Type for a respond payload. */
export function resolveRespondContentType(
  response: CliRespondOptions,
  leafApiResponse?: CliHttpResponseConfig,
): string {
  return (
    response.contentType ??
    leafApiResponse?.contentType ??
    (typeof response.body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8")
  );
}

/** Builds a native HTTP Response from a successful headless respond payload. */
export function apiSuccessResponse(
  response: CliRespondOptions,
  leafApiResponse?: CliHttpResponseConfig,
  defaultStatus?: number,
): Response {
  const contentType = resolveRespondContentType(response, leafApiResponse);
  const headers: Record<string, string> = {
    ...API_CORS_HEADERS,
    "content-type": contentType,
    ...(response.headers ?? {}),
  };
  if (leafApiResponse?.contentDisposition && !headers["content-disposition"]) {
    headers["content-disposition"] = leafApiResponse.contentDisposition;
  }

  const status = response.status ?? defaultStatus ?? 200;
  const { body } = response;

  if (status === 204) {
    return new Response(null, { status: 204, headers });
  }

  if (body instanceof Uint8Array) {
    return new Response(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer, {
      status,
      headers,
    });
  }
  if (typeof body === "string") {
    return new Response(body, { status, headers });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/** Builds a JSON error HTTP Response with CORS headers. */
export function apiErrorResponse(status: number, body: ApiToolCallErrorBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...API_CORS_HEADERS,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

/** Scalar API reference HTML served at GET /openapi-browser. */
export function apiDocsHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Reference</title>
</head>
<body>
  <div id="api-reference"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    Scalar.createApiReference("#api-reference", {
      url: "/openapi.json",
      orderSchemaPropertiesBy: "preserve",
      orderRequiredPropertiesFirst: false,
    });
  </script>
</body>
</html>`;
}
