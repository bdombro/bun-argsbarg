/*
This module validates CLI schemas before execution.
*/

import type { z } from "zod";
import { reservedDocsTopicResourceUris } from "../docs/mcp-resources.ts";
import { DOCS_BUILTIN_TOPIC_KEYS, docsEnabled } from "../docs/resolve.ts";
import { HTTP_RESERVED_TOP_LEVEL_SEGMENTS } from "../http/paths.ts";
import { collectMcpTools, resolveMcpSchemaUri } from "../mcp/tools.ts";
import { reservedCommandNames, resolveCapabilities } from "../runtime/capabilities.ts";
import { validateFormatValue } from "./formats.ts";
import { resolveJsonPointer } from "./json-pointer.ts";
import {
  type AppSpec,
  type Command,
  hasHandler,
  hasSubcommands,
  isDocumentCommand,
  type JsonSchema,
  OptionKind,
  type RunnableCommand,
  SchemaValidationError,
  ValueFormat,
} from "./types.ts";
import { isZodObjectSchema, isZodSchema, type SchemaIo, toJsonSchema } from "./zod-schema.ts";

/** Validates `docs` configuration on the app root. */
function validateDocsConfig(docs: import("./types.ts").DocsConfig): void {
  const topics = docs.topics ?? {};
  const keys = Object.keys(topics);
  for (const reserved of DOCS_BUILTIN_TOPIC_KEYS) {
    if (reserved in topics) {
      throw new SchemaValidationError(`docs.topics key '${reserved}' is reserved for the docs built-in`);
    }
  }
  for (const key of keys) {
    const text = topics[key]?.text;
    if (text === undefined || text.length === 0) {
      throw new SchemaValidationError(`docs.topics['${key}'].text must be non-empty`);
    }
  }
}

/** Validates `appConfig` on the app root. */
function validateConfigBlock(appConfigBlock: import("./types.ts").AppConfig): void {
  const entries = appConfigBlock.entries;
  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
    throw new SchemaValidationError("appConfig.entries must be an object");
  }

  const envNames = new Set<string>();
  for (const [key, entry] of Object.entries(entries)) {
    if (key.length === 0) {
      throw new SchemaValidationError("appConfig.entries keys must be non-empty strings");
    }
    if (entry === undefined || typeof entry !== "object") {
      throw new SchemaValidationError(`appConfig.entries['${key}'] must be an object`);
    }
    const description = entry.description;
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new SchemaValidationError(`appConfig.entries['${key}'].description must be a non-empty string`);
    }
    if (entry.env !== undefined) {
      if (typeof entry.env !== "string" || entry.env.length === 0) {
        throw new SchemaValidationError(`appConfig.entries['${key}'].env must be a non-empty string when set`);
      }
      if (envNames.has(entry.env)) {
        throw new SchemaValidationError(`Duplicate appConfig env mapping: ${entry.env}`);
      }
      envNames.add(entry.env);
    }
    if (entry.resolve !== undefined && typeof entry.resolve !== "function") {
      throw new SchemaValidationError(`appConfig.entries['${key}'].resolve must be a function when set`);
    }
  }

  if ("jsonSchema" in appConfigBlock) {
    throw new SchemaValidationError(
      `appConfig.jsonSchema was replaced by appConfig.schema (a Zod object schema) in argsbarg 8; ${MIGRATION_HINT}`,
    );
  }
  const schema = appConfigBlock.schema;
  if (schema !== undefined) {
    if (!isZodObjectSchema(schema)) {
      throw new SchemaValidationError(
        `appConfig.schema must be a Zod object schema (z.strictObject / z.object); ${MIGRATION_HINT}`,
      );
    }
    for (const key of Object.keys(entries)) {
      if (!(key in schema.shape)) {
        throw new SchemaValidationError(`appConfig.entries key '${key}' is missing from schema.shape`);
      }
    }
    emitOrThrow(schema, "input", "appConfig.schema");
  }
}

/** Where the argsbarg 7 → 8 schema migration is documented (appended to migration errors). */
const MIGRATION_HINT = "see the argsbarg 8.0.0 CHANGELOG migration notes";

/** Rejects non-Zod schema values with a migration hint (argsbarg 7 accepted JSON Schema objects). */
function assertZodSchema(
  /** Candidate schema value. */
  value: unknown,
  /** Field label for the error message (e.g. `inputSchema on status`). */
  label: string,
): asserts value is z.ZodType {
  if (!isZodSchema(value)) {
    throw new SchemaValidationError(
      `${label} must be a Zod schema (argsbarg 8 no longer accepts JSON Schema); ${MIGRATION_HINT}`,
    );
  }
}

/** Emits a schema eagerly so unrepresentable constructs fail at startup (and the emission memo is warm). */
function emitOrThrow(
  /** Schema to emit. */
  schema: z.ZodType,
  /** Emission side. */
  io: SchemaIo,
  /** Field label for the error message. */
  label: string,
): JsonSchema {
  try {
    return toJsonSchema(schema, io);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new SchemaValidationError(`${label} cannot be represented as JSON Schema: ${reason}`);
  }
}

/** Validates `configure` targets. */
function validateConfigureConfig(program: AppSpec): void {
  const configure = program.configure;
  if (!configure) return;

  if (!configure.targets) return;

  const targets = configure.targets;
  const allowedKeys = new Set(["app", "configure"]);
  for (const key of Object.keys(targets)) {
    if (!allowedKeys.has(key)) {
      throw new SchemaValidationError(`configure.targets.${key} is not a valid target key`);
    }
  }
}

/** Validates a program schema. */
export function cliValidateProgram(program: AppSpec): void {
  if (!program.version || program.version.trim().length === 0) {
    throw new SchemaValidationError("version is required");
  }

  if (program.mcpServer !== undefined && program.mcpServer.enabled !== true) {
    throw new SchemaValidationError("mcpServer requires enabled: true; omit mcpServer to disable MCP");
  }

  if (program.mcpServer?.instructions !== undefined && program.mcpServer.instructions.trim().length === 0) {
    throw new SchemaValidationError("mcpServer.instructions must not be empty; omit it instead");
  }

  if (program.httpServer !== undefined && program.httpServer.enabled !== true) {
    throw new SchemaValidationError("httpServer requires enabled: true; omit httpServer to disable HTTP API");
  }

  validateHttpPathPrefix(program);

  if (docsEnabled(program) && program.docs?.topics !== undefined) {
    validateDocsConfig(program.docs);
  }

  if (program.appConfig !== undefined) {
    validateConfigBlock(program.appConfig);
  }

  for (const [label, errorSchema] of [
    ["httpServer.errors.errorSchema", program.httpServer?.errors?.errorSchema],
    ["mcpServer.errors.errorSchema", program.mcpServer?.errors?.errorSchema],
  ] as const) {
    if (errorSchema !== undefined) {
      assertZodSchema(errorSchema, label);
      emitOrThrow(errorSchema, "output", label);
    }
  }

  if (program.configure !== undefined) {
    validateConfigureConfig(program);
  }

  const caps = resolveCapabilities(program);
  const reserved = reservedCommandNames(caps);

  if (hasSubcommands(program)) {
    for (const child of program.commands) {
      if (reserved.includes(child.key)) {
        throw new SchemaValidationError(`Reserved command name: ${child.key}`);
      }
    }
  }

  walkNode(program, program, true);
  validateLeafPathParams(program, []);

  if (caps.mcp) {
    validateMcpToolSchemas(program);
  }
}

/** Keywords whose values are instance data, not subschemas; a `$ref` string inside them is not a reference. */
const SCHEMA_DATA_KEYWORDS = new Set(["const", "default", "enum", "examples"]);

/** Collects every `$ref` string in a schema (skipping instance-data keywords). */
function collectSchemaRefs(
  /** Schema fragment to walk. */
  node: unknown,
  /** Accumulator for found `$ref` values. */
  out: string[],
): string[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectSchemaRefs(item, out);
    }
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") {
        out.push(value);
      } else if (!SCHEMA_DATA_KEYWORDS.has(key)) {
        collectSchemaRefs(value, out);
      }
    }
  }
  return out;
}

/**
 * Checks the schemas MCP clients will see (after object-root wrapping in `collectMcpTools`):
 * every local `$ref` must resolve, and wrapped schemas cannot use `$ref: "#"` (it would point at the wrapper).
 */
function validateMcpToolSchemas(
  /** App spec with `mcpServer.enabled`. */
  program: AppSpec,
): void {
  for (const tool of collectMcpTools(program)) {
    const schemas = [
      { label: "inputSchema", schema: tool.inputSchema, wrapped: tool.inputWrapped },
      { label: "outputSchema", schema: tool.outputSchema, wrapped: tool.outputWrapped },
    ];
    for (const { label, schema, wrapped } of schemas) {
      if (schema === undefined) {
        continue;
      }
      for (const ref of collectSchemaRefs(schema, [])) {
        if (ref === "#" && wrapped) {
          throw new SchemaValidationError(
            `MCP tool "${tool.name}" ${label} uses $ref "#" but its root is not type "object", so MCP wraps it; ` +
              "reference a named definition instead",
          );
        }
        if (ref.startsWith("#/") && resolveJsonPointer(schema, ref) === undefined) {
          throw new SchemaValidationError(`MCP tool "${tool.name}" ${label} has an unresolved $ref: ${ref}`);
        }
      }
    }
  }
}

const PARAM_ROUTER_KEY = /^:[a-zA-Z][a-zA-Z0-9_]*$/;

function isParamRouterKey(key: string): boolean {
  return key.startsWith(":");
}

/** Validates `httpServer.pathPrefix` and reserved top-level command keys. */
function validateHttpPathPrefix(program: AppSpec): void {
  if (!program.httpServer?.enabled) {
    return;
  }
  const raw = program.httpServer.pathPrefix;
  if (raw !== undefined && raw !== "") {
    if (!raw.startsWith("/")) {
      throw new SchemaValidationError(`httpServer.pathPrefix must start with / (got ${JSON.stringify(raw)})`);
    }
    if (raw.length > 1 && raw.endsWith("/")) {
      throw new SchemaValidationError(`httpServer.pathPrefix must not end with / (got ${JSON.stringify(raw)})`);
    }
    if (raw.includes("//")) {
      throw new SchemaValidationError("httpServer.pathPrefix must not contain //");
    }
    if (raw === "/health" || raw === "/swagger" || raw === "/openapi.json" || raw === "/tools") {
      throw new SchemaValidationError(
        `httpServer.pathPrefix must not be a framework path (got ${JSON.stringify(raw)})`,
      );
    }
    return;
  }
  if (!hasSubcommands(program)) {
    if (hasHandler(program) && HTTP_RESERVED_TOP_LEVEL_SEGMENTS.has(program.key)) {
      throw new SchemaValidationError(`Reserved HTTP program key when httpServer.pathPrefix is empty: ${program.key}`);
    }
    return;
  }
  for (const child of program.commands) {
    if (HTTP_RESERVED_TOP_LEVEL_SEGMENTS.has(child.key)) {
      throw new SchemaValidationError(
        `Reserved HTTP command name when httpServer.pathPrefix is empty: ${child.key} (set httpServer.pathPrefix or rename)`,
      );
    }
  }
}

function walkNode(node: Command, program: AppSpec, isRoot: boolean): void {
  if (!isRoot) {
    const rogue = node as AppSpec;
    if (rogue.mcpServer !== undefined) {
      throw new SchemaValidationError(`mcpServer is only supported on the app root (not on ${node.key})`);
    }
    if (rogue.httpServer !== undefined) {
      throw new SchemaValidationError(`httpServer is only supported on the app root (not on ${node.key})`);
    }
    if (rogue.configure !== undefined) {
      throw new SchemaValidationError(`configure is only supported on the app root (not on ${node.key})`);
    }
    if (rogue.docs !== undefined) {
      throw new SchemaValidationError(`docs is only supported on the app root (not on ${node.key})`);
    }
    if (rogue.appConfig !== undefined) {
      throw new SchemaValidationError(`appConfig is only supported on the app root (not on ${node.key})`);
    }
  }

  if (hasHandler(node)) {
    if (isRoot && node.mcpTool !== undefined) {
      throw new SchemaValidationError("mcpTool is only supported on commands with a handler");
    }
    if ((node as { kind?: string }).kind === "json") {
      throw new SchemaValidationError(
        `kind: "json" was removed on ${node.key}; use kind: "document"; ${MIGRATION_HINT}`,
      );
    }
    if (isDocumentCommand(node)) {
      const kindStr = `kind: "${node.kind ?? "document"}"`;
      if (node.inputSchema === undefined) {
        throw new SchemaValidationError(`${kindStr} requires inputSchema on ${node.key}`);
      }
      if ((node.options ?? []).length > 0) {
        throw new SchemaValidationError(`${kindStr} forbids options on ${node.key}`);
      }
      if ((node.positionals ?? []).length > 0) {
        throw new SchemaValidationError(`${kindStr} forbids positionals on ${node.key}`);
      }
    }
    if (node.outputSchema !== undefined) {
      assertZodSchema(node.outputSchema, `outputSchema on ${node.key}`);
      emitOrThrow(node.outputSchema, "output", `outputSchema on ${node.key}`);
    }
    if (node.inputSchema !== undefined) {
      assertZodSchema(node.inputSchema, `inputSchema on ${node.key}`);
      const inputSchema = emitOrThrow(node.inputSchema, "input", `inputSchema on ${node.key}`);
      const properties = inputSchema.properties;
      if (
        properties !== undefined &&
        (typeof properties !== "object" || properties === null || Array.isArray(properties))
      ) {
        throw new SchemaValidationError(`inputSchema.properties must be an object on ${node.key}`);
      }
      if (properties) {
        for (const opt of node.options ?? []) {
          if (opt.kind === OptionKind.Json && !(opt.name in properties)) {
            throw new SchemaValidationError(
              `Json option '${opt.name}' is missing from inputSchema.properties on ${node.key}`,
            );
          }
        }
      }
    }
  } else {
    const rogue = node as unknown as RunnableCommand;
    if (rogue.mcpTool !== undefined) {
      throw new SchemaValidationError(`mcpTool is only supported on commands with a handler (not on ${node.key})`);
    }
  }

  if (isRoot && program.mcpServer?.enabled === true && program.mcpServer.resources) {
    const schemaUri = resolveMcpSchemaUri(program);
    const reserved = new Set([schemaUri, ...reservedDocsTopicResourceUris(program)]);
    const uris = program.mcpServer.resources.map((r) => r.uri);
    for (const uri of uris) {
      if (reserved.has(uri)) {
        const kind = uri === schemaUri ? "built-in schema resource" : "auto docs topic resource";
        throw new SchemaValidationError(`mcpServer.resources URI '${uri}' conflicts with ${kind}`);
      }
    }
    if (new Set(uris).size !== uris.length) {
      throw new SchemaValidationError("mcpServer.resources URIs must be unique");
    }
  }

  if (hasSubcommands(node)) {
    if (!isRoot && (node.options ?? []).length > 0) {
      throw new SchemaValidationError(
        `Options on command group '${node.key}' are not supported — declare options on commands with a handler`,
      );
    }
    const seenNames = new Set<string>();
    let paramRouterCount = 0;
    for (const child of node.commands) {
      if (seenNames.has(child.key)) {
        throw new SchemaValidationError(`Duplicate command name: ${child.key}`);
      }
      seenNames.add(child.key);
      if (isParamRouterKey(child.key)) {
        if (!PARAM_ROUTER_KEY.test(child.key)) {
          throw new SchemaValidationError(
            `Path-parameter group key '${child.key}' must match :[a-zA-Z][a-zA-Z0-9_]* on '${node.key}'`,
          );
        }
        if (!hasSubcommands(child)) {
          throw new SchemaValidationError(`Path-parameter group '${child.key}' must be a command group`);
        }
        paramRouterCount++;
      }
    }
    if (paramRouterCount > 1) {
      throw new SchemaValidationError(`At most one path-parameter group per level on '${node.key}'`);
    }

    if (node.fallbackMode !== undefined && node.fallbackCommand === undefined) {
      throw new SchemaValidationError(`fallbackMode requires fallbackCommand on '${node.key}'`);
    }

    if (node.fallbackCommand !== undefined) {
      const valid = node.commands.find((c) => c.key === node.fallbackCommand);
      if (!valid) {
        throw new SchemaValidationError(`fallbackCommand '${node.fallbackCommand}' is not a child of '${node.key}'`);
      }
    }

    for (const child of node.commands) {
      walkNode(child, program, false);
    }
  }

  if (hasSubcommands(node) && !isRoot) {
    validatePositionals(node.key, []);
  } else {
    const positionals = hasHandler(node) ? (node.positionals ?? []) : [];
    validateOptions(node.key, node.options ?? []);
    validatePositionals(node.key, positionals);
  }
}

function validateOptions(scopeKey: string, options: readonly import("./types.ts").CommandOption[]): void {
  const seenShorts = new Set<string>();
  let pipableCount = 0;
  for (const opt of options) {
    if (opt.pipable) {
      pipableCount++;
      if (opt.kind !== OptionKind.Json) {
        throw new SchemaValidationError(`pipable is only valid on Json kind: ${scopeKey}/${opt.name}`);
      }
    }
    if (opt.kind === OptionKind.Json) {
      if (opt.format !== undefined || opt.pattern !== undefined || opt.default !== undefined) {
        throw new SchemaValidationError(`Json option cannot use format, pattern, or default: ${scopeKey}/${opt.name}`);
      }
    }

    if (opt.required && opt.kind === OptionKind.Presence) {
      throw new SchemaValidationError(`Presence option cannot be required: ${scopeKey}/${opt.name}`);
    }

    if (opt.shortName !== undefined) {
      if (opt.shortName === "h") {
        throw new SchemaValidationError(`Short alias -h is reserved for help: ${scopeKey}/${opt.name}`);
      }
      if (seenShorts.has(opt.shortName)) {
        throw new SchemaValidationError(`Duplicate short alias -${opt.shortName} in scope ${scopeKey}`);
      }
      seenShorts.add(opt.shortName);
    }

    if (opt.kind === OptionKind.Enum) {
      if (!opt.choices || opt.choices.length === 0) {
        throw new SchemaValidationError(`Option '${opt.name}' on '${scopeKey}': Enum kind requires non-empty choices`);
      }
      if (new Set(opt.choices).size !== opt.choices.length) {
        throw new SchemaValidationError(`Option '${opt.name}' on '${scopeKey}': Enum choices must be distinct`);
      }
      for (const choice of opt.choices) {
        if (choice.length === 0) {
          throw new SchemaValidationError(
            `Option '${opt.name}' on '${scopeKey}': Enum choices must be non-empty strings`,
          );
        }
      }
    } else if (opt.choices !== undefined) {
      throw new SchemaValidationError(`Option '${opt.name}' on '${scopeKey}': choices is only valid for Enum kind`);
    }

    if (opt.format !== undefined || opt.pattern !== undefined || opt.default !== undefined) {
      validateOptionValueMetadata(scopeKey, opt);
    }
  }
  if (pipableCount > 1) {
    throw new SchemaValidationError(`At most one pipable Json option per command: ${scopeKey}`);
  }
}

function validateOptionValueMetadata(scopeKey: string, opt: import("./types.ts").CommandOption): void {
  const label = `${scopeKey}/${opt.name}`;

  if (opt.default !== undefined) {
    if (opt.kind === OptionKind.Presence) {
      throw new SchemaValidationError(`default is not valid on presence option ${label}`);
    }
    if (opt.required) {
      throw new SchemaValidationError(`default cannot be set on required option ${label}`);
    }
  }

  if (opt.format !== undefined && opt.pattern !== undefined) {
    throw new SchemaValidationError(`Option ${label}: format and pattern are mutually exclusive`);
  }

  if (opt.format !== undefined) {
    if (opt.kind !== OptionKind.String) {
      throw new SchemaValidationError(`Option ${label}: format is only valid on String kind`);
    }
    if (!Object.values(ValueFormat).includes(opt.format)) {
      throw new SchemaValidationError(`Option ${label}: unknown format '${opt.format}'`);
    }
  }

  if (opt.pattern !== undefined) {
    if (opt.kind !== OptionKind.String) {
      throw new SchemaValidationError(`Option ${label}: pattern is only valid on String kind`);
    }
    try {
      new RegExp(opt.pattern);
    } catch {
      throw new SchemaValidationError(`Option ${label}: invalid pattern regex`);
    }
  }

  if (opt.default !== undefined) {
    try {
      validateFormatValue(opt.default, opt.format, opt.pattern);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SchemaValidationError(`Option ${label}: invalid default: ${msg}`);
    }
  }
}

function validatePositionals(scopeKey: string, positionals: readonly import("./types.ts").CommandPositional[]): void {
  for (const p of positionals) {
    if (p.argMin !== undefined && p.argMin < 0) {
      throw new SchemaValidationError(`argMin must be >= 0 for positional ${scopeKey}/${p.name}`);
    }
    if (p.argMax !== undefined && p.argMax < 0) {
      throw new SchemaValidationError(`argMax must be >= 0 (use 0 for unlimited) for positional ${scopeKey}/${p.name}`);
    }
    const { argMin = 1, argMax = 1 } = p;
    if (argMax > 0 && argMin > argMax) {
      throw new SchemaValidationError(`argMin must not exceed argMax for positional ${scopeKey}/${p.name}`);
    }
  }

  let sawOptional = false;
  for (const p of positionals) {
    const { argMin = 1 } = p;
    if (argMin === 0) {
      sawOptional = true;
    } else if (sawOptional) {
      throw new SchemaValidationError(`Required positional after optional in scope ${scopeKey}`);
    }
  }

  for (let idx = 0; idx < positionals.length; idx++) {
    const positional = positionals[idx];
    if (!positional) {
      continue;
    }
    const { argMax = 1 } = positional;
    if (argMax === 0 && idx + 1 < positionals.length) {
      throw new SchemaValidationError(`Unlimited positional (argMax == 0) must be last in scope ${scopeKey}`);
    }
  }
}

/** Object paths in an emitted schema that accept unknown keys (no `additionalProperties: false`). */
function nonStrictObjectPaths(
  /** Emitted schema fragment. */
  node: unknown,
  /** Path of `node` for messages. */
  path: string,
  /** Accumulator of offending paths. */
  out: string[],
): string[] {
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      nonStrictObjectPaths(item, `${path}[${i}]`, out);
    });
    return out;
  }
  if (typeof node !== "object" || node === null) {
    return out;
  }
  const schema = node as Record<string, unknown>;
  if (
    typeof schema.properties === "object" &&
    schema.properties !== null &&
    schema.additionalProperties === undefined
  ) {
    out.push(path);
  }
  for (const [key, value] of Object.entries(schema)) {
    if (SCHEMA_DATA_KEYWORDS.has(key)) continue;
    nonStrictObjectPaths(value, key === "properties" ? path : `${path}.${key}`, out);
  }
  return out;
}

/**
 * Startup warnings for input and config schemas whose objects accept unknown keys (e.g. `z.object` instead of
 * `z.strictObject`): unknown keys are silently stripped instead of rejected, so agents get no feedback on typos.
 */
export function schemaStrictnessWarnings(
  /** Validated app root. */
  program: AppSpec,
): string[] {
  const warnings: string[] = [];
  const check = (label: string, schema: JsonSchema) => {
    const paths = nonStrictObjectPaths(schema, "$", []);
    if (paths.length > 0) {
      warnings.push(
        `${label} accepts unknown keys at ${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ", …" : ""} ` +
          "(use z.strictObject to reject them)",
      );
    }
  };
  const visit = (node: Command, path: string[]) => {
    if (hasHandler(node) && node.inputSchema !== undefined) {
      check(`inputSchema on ${path.join(" ") || node.key}`, toJsonSchema(node.inputSchema, "input"));
    }
    if (hasSubcommands(node)) {
      for (const child of node.commands) visit(child, [...path, child.key]);
    }
  };
  visit(program, []);
  if (program.appConfig?.schema !== undefined) {
    check("appConfig.schema", toJsonSchema(program.appConfig.schema, "input"));
  }
  return warnings;
}

/**
 * Checks `pathParams` schemas: a Zod object whose keys are exactly the `:param` names above the leaf, and whose
 * keys are not also declared by the leaf's `inputSchema` (a value must come from the URL or the body, not both).
 */
function validateLeafPathParams(
  /** Node being checked. */
  node: Command,
  /** Command path from the root to `node`. */
  path: string[],
): void {
  if (hasSubcommands(node)) {
    for (const child of node.commands) validateLeafPathParams(child, [...path, child.key]);
    return;
  }
  if (!hasHandler(node) || node.pathParams === undefined) return;
  const label = `pathParams on ${path.join(" ") || node.key}`;
  if (!isZodObjectSchema(node.pathParams)) {
    throw new SchemaValidationError(`${label} must be a Zod object schema (z.strictObject)`);
  }
  emitOrThrow(node.pathParams, "input", label);
  const params = path.filter((segment) => segment.startsWith(":")).map((segment) => segment.slice(1));
  const keys = Object.keys(node.pathParams.shape);
  const missing = params.filter((name) => !keys.includes(name));
  const extra = keys.filter((name) => !params.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new SchemaValidationError(
      `${label} must declare exactly the path parameters [${params.join(", ")}] (got [${keys.join(", ")}])`,
    );
  }
  if (node.inputSchema !== undefined) {
    const inputProps = toJsonSchema(node.inputSchema, "input").properties;
    const clash = keys.filter((name) => typeof inputProps === "object" && inputProps !== null && name in inputProps);
    if (clash.length > 0) {
      throw new SchemaValidationError(
        `${label}: ${clash.join(", ")} is also declared by inputSchema; declare path parameters in one place`,
      );
    }
  }
}
