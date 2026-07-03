/*
Maps discovered schema root type names to generated filenames and bridge export constants.
Matches conventions in docs/output-schema.md and docs/config-schema.md.
*/

/** kebab-case from PascalCase segments. */
export function camelToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** SCREAMING_SNAKE from PascalCase. */
export function camelToScreamingSnake(name: string): string {
  return camelToKebab(name).replace(/-/g, "_").toUpperCase();
}

/** Generated JSON filename for an output-schema root type. */
export function outfileForOutputType(typeName: string): string {
  if (typeName.endsWith("JsonOutput")) {
    return `${camelToKebab(typeName.slice(0, -"JsonOutput".length))}.json`;
  }
  if (typeName.endsWith("OpResult")) {
    return `${camelToKebab(typeName.slice(0, -"OpResult".length))}-op-result.json`;
  }
  if (typeName.endsWith("Output")) {
    return `${camelToKebab(typeName.slice(0, -"Output".length))}.json`;
  }
  if (typeName.endsWith("Result")) {
    return `${camelToKebab(typeName.slice(0, -"Result".length))}.json`;
  }
  return `${camelToKebab(typeName)}.json`;
}

/** Bridge export constant for an output-schema root. */
export function outputSchemaExportName(typeName: string): string {
  if (typeName.endsWith("JsonOutput")) {
    const base = typeName.slice(0, -"JsonOutput".length);
    return `${camelToScreamingSnake(base)}_JSON_OUTPUT_SCHEMA`;
  }
  if (typeName.endsWith("OpResult")) {
    const base = typeName.slice(0, -"OpResult".length);
    return `${camelToScreamingSnake(base)}_OP_RESULT_OUTPUT_SCHEMA`;
  }
  if (typeName.endsWith("Output")) {
    const base = typeName.slice(0, -"Output".length);
    return `${camelToScreamingSnake(base)}_OUTPUT_SCHEMA`;
  }
  if (typeName.endsWith("Result")) {
    const base = typeName.slice(0, -"Result".length);
    return `${camelToScreamingSnake(base)}_RESULT_OUTPUT_SCHEMA`;
  }
  return `${camelToScreamingSnake(typeName)}_OUTPUT_SCHEMA`;
}

/** Generated JSON filename for a config-schema root (typically AppConfig → app-config.json). */
export function outfileForConfigType(typeName: string): string {
  if (typeName.endsWith("Config")) {
    return `${camelToKebab(typeName.slice(0, -"Config".length))}-config.json`;
  }
  return `${camelToKebab(typeName)}-config.json`;
}

/** Bridge export constant for a config-schema root (AppConfig → APP_CONFIG_JSON_SCHEMA). */
export function configSchemaExportName(typeName: string): string {
  if (typeName.endsWith("Config")) {
    const base = typeName.slice(0, -"Config".length);
    return `${camelToScreamingSnake(base)}_CONFIG_JSON_SCHEMA`;
  }
  return `${camelToScreamingSnake(typeName)}_CONFIG_JSON_SCHEMA`;
}

/** Import path basename for a generated JSON file (no extension). */
export function jsonImportBasename(outfile: string): string {
  return outfile.replace(/\.json$/, "");
}

/** Safe import binding for a generated JSON file (no extension, hyphens → underscores). */
export function jsonImportVar(outfile: string): string {
  return jsonImportBasename(outfile).replace(/-/g, "_");
}
