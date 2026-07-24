/*
HTTP path prefix helpers and framework route guards.
*/

import type { CliProgram } from "~/core/types.ts";

/** Top-level segments reserved for framework routes when `pathPrefix` is empty. */
export const HTTP_RESERVED_TOP_LEVEL_SEGMENTS = new Set(["health", "openapi.json", "swagger", "tools"]);

/** Resolved path prefix for user HTTP routes (`""` by default, or e.g. `"/api"`). */
export function resolveHttpPathPrefix(program: CliProgram): string {
  const raw = program.httpServer?.pathPrefix;
  if (raw === undefined || raw === "") {
    return "";
  }
  return raw;
}

/** OpenAPI / route path for a user command from URL segments. */
export function buildHttpUserPath(prefix: string, urlSegments: string[]): string {
  const tail = urlSegments.map((s) => (s.startsWith(":") ? `{${s.slice(1)}}` : s)).join("/");
  if (!prefix) {
    return tail ? `/${tail}` : "/";
  }
  return tail ? `${prefix}/${tail}` : prefix;
}

/** Regex-safe path prefix for route matching. */
export function httpUserPathRegexPrefix(prefix: string): string {
  if (!prefix) {
    return "";
  }
  return prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wildcard label for docs (e.g. `/api/*` or `/*`). */
export function httpUserPathGlob(prefix: string): string {
  return prefix ? `${prefix}/*` : "/*";
}
