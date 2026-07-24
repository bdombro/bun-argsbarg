/** Directory name for generated schema artifacts (colocated with `@sg` source files). */
export const GENERATED_DIR = "__generated__";

/** JSON basename for a schema root (`RenderJsonInputSchema.json`, etc.). */
export function schemaJsonBasename(typeName: string): string {
  return `${typeName}Schema.json`;
}

/** Export const name wired on leaves or `program.appConfig`. */
export function schemaExportName(typeName: string): string {
  return `${typeName}Schema`;
}

/** Safe import binding for a schema JSON basename. */
export function schemaJsonImportVar(typeName: string): string {
  return `${typeName}SchemaJson`;
}
