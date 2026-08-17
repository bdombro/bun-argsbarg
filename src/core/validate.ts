/*
This module validates CLI schemas before execution.
*/

import { reservedDocsTopicResourceUris } from "../docs/mcp-resources.ts";
import { DOCS_BUILTIN_TOPIC_KEYS, docsEnabled } from "../docs/resolve.ts";
import { HTTP_RESERVED_TOP_LEVEL_SEGMENTS } from "../http/paths.ts";
import { resolveMcpSchemaUri } from "../mcp/tools.ts";
import { reservedCommandNames, resolveCapabilities } from "../runtime/capabilities.ts";
import { validateFormatValue } from "./formats.ts";
import {
  type CliLeaf,
  type CliNode,
  CliOptionKind,
  type CliProgram,
  CliSchemaValidationError,
  CliValueFormat,
  isCliLeaf,
  isCliRouter,
  isJsonLeaf,
} from "./types.ts";

/** Validates `docs` configuration on the program root. */
function validateDocsConfig(docs: import("./types.ts").CliDocsConfig): void {
  const topics = docs.topics ?? {};
  const keys = Object.keys(topics);
  for (const reserved of DOCS_BUILTIN_TOPIC_KEYS) {
    if (reserved in topics) {
      throw new CliSchemaValidationError(`docs.topics key '${reserved}' is reserved for the docs built-in`);
    }
  }
  for (const key of keys) {
    const text = topics[key]?.text;
    if (text === undefined || text.length === 0) {
      throw new CliSchemaValidationError(`docs.topics['${key}'].text must be non-empty`);
    }
  }
}

/** Validates `program.appConfig` on the program root. */
function validateConfigBlock(appConfigBlock: import("./types.ts").CliAppConfig): void {
  const entries = appConfigBlock.entries;
  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
    throw new CliSchemaValidationError("program.appConfig.entries must be an object");
  }

  const envNames = new Set<string>();
  for (const [key, entry] of Object.entries(entries)) {
    if (key.length === 0) {
      throw new CliSchemaValidationError("program.appConfig.entries keys must be non-empty strings");
    }
    if (entry === undefined || typeof entry !== "object") {
      throw new CliSchemaValidationError(`program.appConfig.entries['${key}'] must be an object`);
    }
    const description = entry.description;
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new CliSchemaValidationError(`program.appConfig.entries['${key}'].description must be a non-empty string`);
    }
    if (entry.env !== undefined) {
      if (typeof entry.env !== "string" || entry.env.length === 0) {
        throw new CliSchemaValidationError(
          `program.appConfig.entries['${key}'].env must be a non-empty string when set`,
        );
      }
      if (envNames.has(entry.env)) {
        throw new CliSchemaValidationError(`Duplicate program.appConfig env mapping: ${entry.env}`);
      }
      envNames.add(entry.env);
    }
    if (entry.resolve !== undefined && typeof entry.resolve !== "function") {
      throw new CliSchemaValidationError(`program.appConfig.entries['${key}'].resolve must be a function when set`);
    }
  }

  const jsonSchema = appConfigBlock.jsonSchema;
  if (jsonSchema !== undefined) {
    if (typeof jsonSchema !== "object" || jsonSchema === null || Array.isArray(jsonSchema)) {
      throw new CliSchemaValidationError(
        "program.appConfig.jsonSchema must be a JSON Schema object (not null or an array)",
      );
    }
    const properties = jsonSchema.properties;
    if (properties !== undefined) {
      if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
        throw new CliSchemaValidationError("program.appConfig.jsonSchema.properties must be an object when set");
      }
      for (const key of Object.keys(entries)) {
        if (!(key in properties)) {
          throw new CliSchemaValidationError(
            `program.appConfig.entries key '${key}' is missing from jsonSchema.properties`,
          );
        }
      }
    }
  }
}

/** Validates `program.configure` targets. */
function validateConfigureConfig(program: CliProgram): void {
  const configure = program.configure;
  if (!configure) return;

  if ("prefix" in configure) {
    throw new CliSchemaValidationError("configure.prefix removed; app binary installs via Homebrew");
  }

  if ("agentIntegration" in configure) {
    throw new CliSchemaValidationError("configure.agentIntegration removed; use program.skill.enabled for skills");
  }

  if (!configure.targets) return;

  const targets = configure.targets;
  if ("allSkills" in targets || "allMcps" in targets) {
    throw new CliSchemaValidationError("configure.targets.allSkills/allMcps removed; use per-key targets");
  }

  const legacySkillKeys = ["cursorSkill", "claudeSkill", "codexSkill", "opencodeSkill", "openclawSkill"] as const;
  for (const key of legacySkillKeys) {
    if (key in targets) {
      throw new CliSchemaValidationError(
        `configure.targets.${key} removed; use program.skill.enabled for agent skill install`,
      );
    }
  }

  const legacyMcpKeys = [
    "cursorMcp",
    "claudeCodeMcp",
    "claudeDesktopMcp",
    "codexMcp",
    "chatgptMcp",
    "openclawMcp",
    "opencodeMcp",
    "agentsMcp",
  ] as const;
  for (const key of legacyMcpKeys) {
    if (key in targets) {
      throw new CliSchemaValidationError(
        `configure.targets.${key} removed; MCP installs to ~/.agents/mcp.json when mcpServer.enabled`,
      );
    }
  }

  const allowedKeys = new Set(["app", "configure"]);
  for (const key of Object.keys(targets)) {
    if (!allowedKeys.has(key)) {
      throw new CliSchemaValidationError(`configure.targets.${key} is not a valid target key`);
    }
  }
}

/** Validates a program schema. */
export function cliValidateProgram(program: CliProgram): void {
  if (!program.version || program.version.trim().length === 0) {
    throw new CliSchemaValidationError("CliProgram.version is required");
  }

  if (program.mcpServer !== undefined && program.mcpServer.enabled !== true) {
    throw new CliSchemaValidationError("mcpServer requires enabled: true; omit mcpServer to disable MCP");
  }

  if (program.httpServer !== undefined && program.httpServer.enabled !== true) {
    throw new CliSchemaValidationError("httpServer requires enabled: true; omit httpServer to disable HTTP API");
  }

  validateHttpPathPrefix(program);

  if (docsEnabled(program) && program.docs?.topics !== undefined) {
    validateDocsConfig(program.docs);
  }

  if (program.appConfig !== undefined) {
    validateConfigBlock(program.appConfig);
  }

  if (program.configure !== undefined) {
    validateConfigureConfig(program);
  }

  const caps = resolveCapabilities(program);
  const reserved = reservedCommandNames(caps);

  if (isCliRouter(program)) {
    for (const child of program.commands) {
      if (reserved.includes(child.key)) {
        throw new CliSchemaValidationError(`Reserved command name: ${child.key}`);
      }
    }
  }

  walkNode(program, program, true);
}

const PARAM_ROUTER_KEY = /^:[a-zA-Z][a-zA-Z0-9_]*$/;

function isParamRouterKey(key: string): boolean {
  return key.startsWith(":");
}

/** Validates `httpServer.pathPrefix` and reserved top-level command keys. */
function validateHttpPathPrefix(program: CliProgram): void {
  if (!program.httpServer?.enabled) {
    return;
  }
  const raw = program.httpServer.pathPrefix;
  if (raw !== undefined && raw !== "") {
    if (!raw.startsWith("/")) {
      throw new CliSchemaValidationError(`httpServer.pathPrefix must start with / (got ${JSON.stringify(raw)})`);
    }
    if (raw.length > 1 && raw.endsWith("/")) {
      throw new CliSchemaValidationError(`httpServer.pathPrefix must not end with / (got ${JSON.stringify(raw)})`);
    }
    if (raw.includes("//")) {
      throw new CliSchemaValidationError("httpServer.pathPrefix must not contain //");
    }
    if (raw === "/health" || raw === "/swagger" || raw === "/openapi.json" || raw === "/tools") {
      throw new CliSchemaValidationError(
        `httpServer.pathPrefix must not be a framework path (got ${JSON.stringify(raw)})`,
      );
    }
    return;
  }
  if (!isCliRouter(program)) {
    if (isCliLeaf(program) && HTTP_RESERVED_TOP_LEVEL_SEGMENTS.has(program.key)) {
      throw new CliSchemaValidationError(
        `Reserved HTTP program key when httpServer.pathPrefix is empty: ${program.key}`,
      );
    }
    return;
  }
  for (const child of program.commands) {
    if (HTTP_RESERVED_TOP_LEVEL_SEGMENTS.has(child.key)) {
      throw new CliSchemaValidationError(
        `Reserved HTTP command name when httpServer.pathPrefix is empty: ${child.key} (set httpServer.pathPrefix or rename)`,
      );
    }
  }
}

function walkNode(node: CliNode, program: CliProgram, isRoot: boolean): void {
  if (!isRoot) {
    const rogue = node as CliProgram;
    if (rogue.mcpServer !== undefined) {
      throw new CliSchemaValidationError(`mcpServer is only supported on the program root (not on ${node.key})`);
    }
    if (rogue.httpServer !== undefined) {
      throw new CliSchemaValidationError(`httpServer is only supported on the program root (not on ${node.key})`);
    }
    if (rogue.configure !== undefined) {
      throw new CliSchemaValidationError(`configure is only supported on the program root (not on ${node.key})`);
    }
    if (rogue.docs !== undefined) {
      throw new CliSchemaValidationError(`docs is only supported on the program root (not on ${node.key})`);
    }
    if (rogue.appConfig !== undefined) {
      throw new CliSchemaValidationError(`appConfig is only supported on the program root (not on ${node.key})`);
    }
  }

  if (isCliLeaf(node)) {
    if (isRoot && node.mcpTool !== undefined) {
      throw new CliSchemaValidationError("mcpTool is only supported on leaf commands");
    }
    if (isJsonLeaf(node)) {
      if (node.inputSchema === undefined) {
        throw new CliSchemaValidationError(`kind: "json" requires inputSchema on ${node.key}`);
      }
      if ((node.options ?? []).length > 0) {
        throw new CliSchemaValidationError(`kind: "json" forbids options on ${node.key}`);
      }
      if ((node.positionals ?? []).length > 0) {
        throw new CliSchemaValidationError(`kind: "json" forbids positionals on ${node.key}`);
      }
    }
    const outputSchema = node.outputSchema;
    if (
      outputSchema !== undefined &&
      (typeof outputSchema !== "object" || outputSchema === null || Array.isArray(outputSchema))
    ) {
      throw new CliSchemaValidationError("outputSchema must be a JSON Schema object (not null or an array)");
    }
    const inputSchema = node.inputSchema;
    if (
      inputSchema !== undefined &&
      (typeof inputSchema !== "object" || inputSchema === null || Array.isArray(inputSchema))
    ) {
      throw new CliSchemaValidationError("inputSchema must be a JSON Schema object (not null or an array)");
    }
    if (inputSchema !== undefined) {
      const properties = inputSchema.properties;
      if (
        properties !== undefined &&
        (typeof properties !== "object" || properties === null || Array.isArray(properties))
      ) {
        throw new CliSchemaValidationError(`inputSchema.properties must be an object on ${node.key}`);
      }
      if (properties) {
        for (const opt of node.options ?? []) {
          if (opt.kind === CliOptionKind.Json && !(opt.name in properties)) {
            throw new CliSchemaValidationError(
              `Json option '${opt.name}' is missing from inputSchema.properties on ${node.key}`,
            );
          }
        }
      }
    }
  } else {
    const rogue = node as unknown as CliLeaf;
    if (rogue.mcpTool !== undefined) {
      throw new CliSchemaValidationError(`mcpTool is only supported on leaf commands (not on ${node.key})`);
    }
  }

  if (isRoot && program.mcpServer?.enabled === true && program.mcpServer.resources) {
    const schemaUri = resolveMcpSchemaUri(program);
    const reserved = new Set([schemaUri, ...reservedDocsTopicResourceUris(program)]);
    const uris = program.mcpServer.resources.map((r) => r.uri);
    for (const uri of uris) {
      if (reserved.has(uri)) {
        const kind = uri === schemaUri ? "built-in schema resource" : "auto docs topic resource";
        throw new CliSchemaValidationError(`mcpServer.resources URI '${uri}' conflicts with ${kind}`);
      }
    }
    if (new Set(uris).size !== uris.length) {
      throw new CliSchemaValidationError("mcpServer.resources URIs must be unique");
    }
  }

  if (isCliRouter(node)) {
    if (!isRoot && (node.options ?? []).length > 0) {
      throw new CliSchemaValidationError(
        `Options on routing group '${node.key}' are not supported — declare options on leaf commands`,
      );
    }
    const seenNames = new Set<string>();
    let paramRouterCount = 0;
    for (const child of node.commands) {
      if (seenNames.has(child.key)) {
        throw new CliSchemaValidationError(`Duplicate command name: ${child.key}`);
      }
      seenNames.add(child.key);
      if (isParamRouterKey(child.key)) {
        if (!PARAM_ROUTER_KEY.test(child.key)) {
          throw new CliSchemaValidationError(
            `Param router key '${child.key}' must match :[a-zA-Z][a-zA-Z0-9_]* on '${node.key}'`,
          );
        }
        if (!isCliRouter(child)) {
          throw new CliSchemaValidationError(`Param router '${child.key}' must be a router with subcommands`);
        }
        paramRouterCount++;
      }
    }
    if (paramRouterCount > 1) {
      throw new CliSchemaValidationError(`At most one param router per level on '${node.key}'`);
    }

    if (node.fallbackMode !== undefined && node.fallbackCommand === undefined) {
      throw new CliSchemaValidationError(`fallbackMode requires fallbackCommand on '${node.key}'`);
    }

    if (node.fallbackCommand !== undefined) {
      const valid = node.commands.find((c) => c.key === node.fallbackCommand);
      if (!valid) {
        throw new CliSchemaValidationError(`fallbackCommand '${node.fallbackCommand}' is not a child of '${node.key}'`);
      }
    }

    for (const child of node.commands) {
      walkNode(child, program, false);
    }
  }

  if (isCliRouter(node) && !isRoot) {
    validatePositionals(node.key, []);
  } else {
    const positionals = isCliLeaf(node) ? (node.positionals ?? []) : [];
    validateOptions(node.key, node.options ?? []);
    validatePositionals(node.key, positionals);
  }
}

function validateOptions(scopeKey: string, options: import("./types.ts").CliOption[]): void {
  const seenShorts = new Set<string>();
  let pipableCount = 0;
  for (const opt of options) {
    if (opt.pipable) {
      pipableCount++;
      if (opt.kind !== CliOptionKind.Json) {
        throw new CliSchemaValidationError(`pipable is only valid on Json kind: ${scopeKey}/${opt.name}`);
      }
    }
    if (opt.kind === CliOptionKind.Json) {
      if (opt.format !== undefined || opt.pattern !== undefined || opt.default !== undefined) {
        throw new CliSchemaValidationError(
          `Json option cannot use format, pattern, or default: ${scopeKey}/${opt.name}`,
        );
      }
    }

    if (opt.required && opt.kind === CliOptionKind.Presence) {
      throw new CliSchemaValidationError(`Presence option cannot be required: ${scopeKey}/${opt.name}`);
    }

    if (opt.shortName !== undefined) {
      if (opt.shortName === "h") {
        throw new CliSchemaValidationError(`Short alias -h is reserved for help: ${scopeKey}/${opt.name}`);
      }
      if (seenShorts.has(opt.shortName)) {
        throw new CliSchemaValidationError(`Duplicate short alias -${opt.shortName} in scope ${scopeKey}`);
      }
      seenShorts.add(opt.shortName);
    }

    if (opt.kind === CliOptionKind.Enum) {
      if (!opt.choices || opt.choices.length === 0) {
        throw new CliSchemaValidationError(
          `Option '${opt.name}' on '${scopeKey}': Enum kind requires non-empty choices`,
        );
      }
      if (new Set(opt.choices).size !== opt.choices.length) {
        throw new CliSchemaValidationError(`Option '${opt.name}' on '${scopeKey}': Enum choices must be distinct`);
      }
      for (const choice of opt.choices) {
        if (choice.length === 0) {
          throw new CliSchemaValidationError(
            `Option '${opt.name}' on '${scopeKey}': Enum choices must be non-empty strings`,
          );
        }
      }
    } else if (opt.choices !== undefined) {
      throw new CliSchemaValidationError(`Option '${opt.name}' on '${scopeKey}': choices is only valid for Enum kind`);
    }

    if (opt.format !== undefined || opt.pattern !== undefined || opt.default !== undefined) {
      validateOptionValueMetadata(scopeKey, opt);
    }
  }
  if (pipableCount > 1) {
    throw new CliSchemaValidationError(`At most one pipable Json option per command: ${scopeKey}`);
  }
}

function validateOptionValueMetadata(scopeKey: string, opt: import("./types.ts").CliOption): void {
  const label = `${scopeKey}/${opt.name}`;

  if (opt.default !== undefined) {
    if (opt.kind === CliOptionKind.Presence) {
      throw new CliSchemaValidationError(`default is not valid on presence option ${label}`);
    }
    if (opt.required) {
      throw new CliSchemaValidationError(`default cannot be set on required option ${label}`);
    }
  }

  if (opt.format !== undefined && opt.pattern !== undefined) {
    throw new CliSchemaValidationError(`Option ${label}: format and pattern are mutually exclusive`);
  }

  if (opt.format !== undefined) {
    if (opt.kind !== CliOptionKind.String) {
      throw new CliSchemaValidationError(`Option ${label}: format is only valid on String kind`);
    }
    if (!Object.values(CliValueFormat).includes(opt.format)) {
      throw new CliSchemaValidationError(`Option ${label}: unknown format '${opt.format}'`);
    }
  }

  if (opt.pattern !== undefined) {
    if (opt.kind !== CliOptionKind.String) {
      throw new CliSchemaValidationError(`Option ${label}: pattern is only valid on String kind`);
    }
    try {
      new RegExp(opt.pattern);
    } catch {
      throw new CliSchemaValidationError(`Option ${label}: invalid pattern regex`);
    }
  }

  if (opt.default !== undefined) {
    try {
      validateFormatValue(opt.default, opt.format, opt.pattern);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CliSchemaValidationError(`Option ${label}: invalid default: ${msg}`);
    }
  }
}

function validatePositionals(scopeKey: string, positionals: import("./types.ts").CliPositional[]): void {
  for (const p of positionals) {
    if (p.argMin !== undefined && p.argMin < 0) {
      throw new CliSchemaValidationError(`argMin must be >= 0 for positional ${scopeKey}/${p.name}`);
    }
    if (p.argMax !== undefined && p.argMax < 0) {
      throw new CliSchemaValidationError(
        `argMax must be >= 0 (use 0 for unlimited) for positional ${scopeKey}/${p.name}`,
      );
    }
    const { argMin = 1, argMax = 1 } = p;
    if (argMax > 0 && argMin > argMax) {
      throw new CliSchemaValidationError(`argMin must not exceed argMax for positional ${scopeKey}/${p.name}`);
    }
  }

  let sawOptional = false;
  for (const p of positionals) {
    const { argMin = 1 } = p;
    if (argMin === 0) {
      sawOptional = true;
    } else if (sawOptional) {
      throw new CliSchemaValidationError(`Required positional after optional in scope ${scopeKey}`);
    }
  }

  for (let idx = 0; idx < positionals.length; idx++) {
    const positional = positionals[idx];
    if (!positional) {
      continue;
    }
    const { argMax = 1 } = positional;
    if (argMax === 0 && idx + 1 < positionals.length) {
      throw new CliSchemaValidationError(`Unlimited positional (argMax == 0) must be last in scope ${scopeKey}`);
    }
  }
}
