import type { SchemaRootKind } from "./discover-schema-roots.ts";

/** Directory name for generated schema artifacts (next to `schema.ts`). */
export const GENERATED_DIR = "__generated__";

/** TypeScript schema root filename under `src/`. */
export const SCHEMA_FILE = "schema.ts";

/** JSON basename for a schema root kind (`outputSchema.json`, etc.). */
export function schemaJsonBasename(kind: SchemaRootKind): string {
  return `${kind}Schema.json`;
}

/** Export const name wired on leaves or `program.appConfig`. */
export function schemaExportName(kind: SchemaRootKind): string {
  return `${kind}Schema`;
}

/** Safe import binding for a schema JSON basename. */
export function schemaJsonImportVar(kind: SchemaRootKind): string {
  return `${kind}SchemaJson`;
}
