/*
Inline JSON Schema $ref dereferencing for OpenAPI embedding.
*/

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Resolves a same-document JSON Pointer (`#/definitions/Foo`). */
function resolveJsonPointer(root: Record<string, unknown>, ref: string): unknown {
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
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function derefValue(value: unknown, root: Record<string, unknown>, resolving: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => derefValue(item, root, resolving));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  if (typeof value.$ref === "string") {
    const { $ref, ...siblings } = value;
    if (resolving.has($ref)) {
      return value;
    }
    const target = resolveJsonPointer(root, $ref);
    if (target === undefined) {
      return value;
    }
    resolving.add($ref);
    const resolved = derefValue(structuredClone(target), root, resolving);
    resolving.delete($ref);
    if (!isPlainObject(resolved)) {
      return resolved;
    }
    if (Object.keys(siblings).length === 0) {
      return resolved;
    }
    return { ...resolved, ...siblings };
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "definitions" || key === "$defs") {
      continue;
    }
    out[key] = derefValue(child, root, resolving);
  }
  return out;
}

/** Inlines internal `$ref` pointers and drops `definitions` / `$defs` from the output. */
export function dereferenceJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const root = structuredClone(schema);
  return derefValue(root, root, new Set()) as Record<string, unknown>;
}
