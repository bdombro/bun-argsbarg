/*
Same-document JSON Pointer resolution for JSON Schema `$ref` values (`#/definitions/Foo`).
Shared by schemagen root hoisting, MCP tool schema checks, config validation, and OpenAPI dereferencing.
*/

/**
 * Decodes one JSON Pointer segment: URI percent-escapes first (ts-json-schema-generator writes
 * `#/definitions/Box%3Cstring%3E`), then the `~1` → `/` and `~0` → `~` pointer escapes.
 */
export function decodeJsonPointerSegment(
  /** Raw segment between `/` separators. */
  segment: string,
): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Malformed percent-escape: fall back to the raw segment.
  }
  return decoded.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Resolves a same-document JSON Pointer (`#/definitions/Foo`) against `root`; `undefined` when it does not resolve. */
export function resolveJsonPointer(
  /** Document the pointer is resolved against (the schema root). */
  root: unknown,
  /** `$ref` value; only `#/…` pointers are resolved. */
  ref: string,
): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  const segments = ref
    .slice(2)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodeJsonPointerSegment);
  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
