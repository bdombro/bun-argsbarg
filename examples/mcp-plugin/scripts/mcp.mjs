#!/usr/bin/env bun
// @bun

// ../../src/config/file.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync4, readFileSync as readFileSync2, rmSync as rmSync2, unlinkSync, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname5, join as join5 } from "node:path";

// ../../src/core/types.ts
var CliValueFormat;
((CliValueFormat2) => {
  CliValueFormat2["Duration"] = "duration";
  CliValueFormat2["CommaList"] = "comma-list";
  CliValueFormat2["Date"] = "date";
  CliValueFormat2["DateTime"] = "date-time";
})(CliValueFormat ||= {});
function isCliLeaf(node) {
  return "handler" in node && typeof node.handler === "function";
}
function isDocumentLeaf(leaf) {
  return leaf.kind === "document" || leaf.kind === "json";
}
function isCliRouter(node) {
  return "commands" in node && Array.isArray(node.commands);
}
function leafOutputSchema(leaf) {
  return leaf.outputSchema;
}

class CliSchemaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliSchemaValidationError";
  }
}

// ../../src/config/entry.ts
function defaultConfigEntryTitle(key) {
  return key;
}
function defaultConfigEntrySensitive(key) {
  return /key|token|secret|password/i.test(key);
}
function configEntryRequired(key, entry, jsonSchemaRequired) {
  if (entry.required === false) {
    return false;
  }
  if (jsonSchemaRequired !== undefined) {
    return jsonSchemaRequired.has(key);
  }
  return true;
}
function configEntrySensitive(key, entry) {
  return entry.sensitive ?? defaultConfigEntrySensitive(key);
}
function configUserConfigKey(key) {
  const snake = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return snake || "config_key";
}
function jsonSchemaRequiredKeys(jsonSchema) {
  const required = jsonSchema.required;
  if (!Array.isArray(required)) {
    return;
  }
  return new Set(required.filter((k) => typeof k === "string"));
}
function configCommandsEnabled(program) {
  if (!program.appConfig) {
    return false;
  }
  const commands = program.appConfig.commands;
  if (commands === false) {
    return false;
  }
  if (typeof commands === "object" && commands.enabled === false) {
    return false;
  }
  return true;
}
function configMcpSetEnabled(program) {
  const commands = program.appConfig?.commands;
  if (typeof commands === "object" && commands.mcpSet === false) {
    return false;
  }
  return true;
}

// ../../src/runtime/capabilities.ts
function resolveCapabilities(program) {
  const configure = program.configure?.enabled !== false;
  return {
    http: program.httpServer?.enabled === true,
    completion: program.completion?.enabled !== false,
    mcp: program.mcpServer?.enabled === true,
    configure,
    docs: program.docs?.enabled !== false,
    configCommands: configCommandsEnabled(program)
  };
}
function reservedCommandNames(caps) {
  const names = ["version"];
  if (caps.completion) {
    names.unshift("completion");
  }
  if (caps.configure) {
    names.push("configure");
  }
  if (caps.docs) {
    names.push("docs");
  }
  if (caps.mcp) {
    names.push("mcp");
  }
  if (caps.http) {
    names.push("http");
  }
  return names;
}
function skipsRequiredAppConfigExit(path, caps) {
  const root = path[0];
  if (root === "configure" && caps.configure) {
    const sub = path[1];
    if (!sub || sub === "get" || sub === "set" || sub === "install" || sub === "uninstall" || sub === "status") {
      return true;
    }
  }
  if (root === "docs" && caps.docs) {
    return true;
  }
  return false;
}
function capabilityDeniedMessage(feature) {
  switch (feature) {
    case "completion":
      return `Shell completion is not available for this app.
`;
    case "http":
      return `HTTP API is not available for this app.
`;
    case "mcp":
      return `MCP is not available for this app.
`;
    case "configure":
      return `Configure is not available for this app.
`;
    case "docs":
      return `Documentation commands are not available for this app.
`;
  }
}
function assertBuiltinAllowed(argv, caps) {
  if (argv.length < 1) {
    return;
  }
  const first = argv[0];
  if (first === "completion" && !caps.completion) {
    process.stderr.write(capabilityDeniedMessage("completion"));
    process.exit(1);
  }
  if (first === "mcp" && !caps.mcp) {
    process.stderr.write(capabilityDeniedMessage("mcp"));
    process.exit(1);
  }
  if (first === "http" && !caps.http) {
    process.stderr.write(capabilityDeniedMessage("http"));
    process.exit(1);
  }
  if (first === "configure" && !caps.configure) {
    process.stderr.write(capabilityDeniedMessage("configure"));
    process.exit(1);
  }
  if (first === "docs" && !caps.docs) {
    process.stderr.write(capabilityDeniedMessage("docs"));
    process.exit(1);
  }
}

// ../../src/runtime/exposure.ts
function isCliHidden(node) {
  return node.cli?.hidden === true;
}
function isOptionCliHidden(opt) {
  return opt.cli?.hidden === true;
}
function isCliSchemaHidden(node) {
  if (node.cli?.schema?.enabled === false) {
    return true;
  }
  if (node.cli?.schema?.hidden === true) {
    return true;
  }
  return isCliHidden(node);
}
function isMcpHidden(leaf) {
  if (leaf.mcpTool?.enabled === false) {
    return true;
  }
  return leaf.mcpTool?.hidden === true;
}
function isCliCallable(node, parentEnabled = true) {
  if (!parentEnabled) {
    return false;
  }
  if (node.cli?.enabled === false) {
    return false;
  }
  return true;
}
function isHttpHidden(node) {
  return node.http?.hidden === true;
}
function isHttpDisabled(node) {
  return node.http?.enabled === false;
}
function visibleOptions(options) {
  return (options ?? []).filter((o) => !isOptionCliHidden(o));
}
function presentationNode(node) {
  if (isCliHidden(node)) {
    return null;
  }
  const options = visibleOptions(node.options);
  if (isCliRouter(node)) {
    const commands = node.commands.map((ch) => presentationNode(ch)).filter((ch) => ch !== null);
    return { ...node, options, commands };
  }
  return { ...node, options };
}
function visibleSubcommands(cmds) {
  return cmds.filter((c) => !isCliHidden(c));
}
function leafHttpResponseDefaults(leaf) {
  return {
    contentType: leaf.http?.successContentType,
    contentDisposition: leaf.http?.contentDisposition
  };
}

// ../../src/core/wire-schema.ts
var DURATION_PATTERN = "^\\d+[hdms]?$";
var MCP_WIRE_OMIT_PRESENCE = new Set(["json", "yes", "verbose"]);
function optionProperty(opt) {
  const base = {
    description: opt.description
  };
  if (opt.default !== undefined) {
    base.default = opt.default;
  }
  switch (opt.kind) {
    case "presence" /* Presence */:
      return { type: "boolean", ...base };
    case "string" /* String */: {
      if (opt.format === "comma-list" /* CommaList */) {
        return {
          oneOf: [
            { type: "string", ...base },
            { type: "array", items: { type: "string" }, ...base }
          ]
        };
      }
      const stringBase = { type: "string", ...base };
      if (opt.format === "duration" /* Duration */) {
        return { ...stringBase, pattern: DURATION_PATTERN };
      }
      if (opt.format === "date" /* Date */) {
        return { ...stringBase, format: "date" };
      }
      if (opt.format === "date-time" /* DateTime */) {
        return { ...stringBase, format: "date-time" };
      }
      if (opt.pattern !== undefined) {
        return { ...stringBase, pattern: opt.pattern };
      }
      return stringBase;
    }
    case "number" /* Number */:
      return { type: "number", ...base };
    case "enum" /* Enum */:
      return { type: "string", enum: opt.choices, ...base };
    case "json" /* Json */:
      return { type: "object", ...base };
  }
}
function positionalProperty(p) {
  const base = { description: p.description };
  const { argMax = 1 } = p;
  if (argMax === 0) {
    return { type: "array", items: { type: "string" }, ...base };
  }
  return { type: "string", ...base };
}
function leafWireOptions(leaf) {
  return visibleOptions(leaf.options).filter((o) => {
    if (o.kind === "presence" /* Presence */ && MCP_WIRE_OMIT_PRESENCE.has(o.name)) {
      return false;
    }
    return true;
  });
}
function buildLeafInputSchema(leaf) {
  if (leaf.inputSchema !== undefined) {
    return leaf.inputSchema;
  }
  const properties = {};
  const required = [];
  for (const opt of leafWireOptions(leaf)) {
    properties[opt.name] = optionProperty(opt);
    if (opt.required) {
      required.push(opt.name);
    }
  }
  for (const p of leaf.positionals ?? []) {
    properties[p.name] = positionalProperty(p);
    const { argMin = 1, argMax = 1 } = p;
    if (argMax === 1 && argMin >= 1) {
      required.push(p.name);
    }
  }
  const schema = {
    type: "object",
    properties,
    additionalProperties: false
  };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

// ../../src/http/paths.ts
var HTTP_RESERVED_TOP_LEVEL_SEGMENTS = new Set(["health", "openapi.json", "swagger", "tools"]);
function resolveHttpPathPrefix(program) {
  const raw = program.httpServer?.pathPrefix;
  if (raw === undefined || raw === "") {
    return "";
  }
  return raw;
}
function buildHttpUserPath(prefix, urlSegments) {
  const tail = urlSegments.map((s) => s.startsWith(":") ? `{${s.slice(1)}}` : s).join("/");
  if (!prefix) {
    return tail ? `/${tail}` : "/";
  }
  return tail ? `${prefix}/${tail}` : prefix;
}
function httpUserPathRegexPrefix(prefix) {
  if (!prefix) {
    return "";
  }
  return prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function httpUserPathGlob(prefix) {
  return prefix ? `${prefix}/*` : "/*";
}

// ../../src/http/routes.ts
var VERB_KEYS = new Set(["get", "post", "put", "patch", "delete"]);
function isParamRouterKey(key) {
  return key.startsWith(":");
}
function inferHttpMethod(leaf) {
  if (leaf.http?.method) {
    return leaf.http.method;
  }
  const lower = leaf.key.toLowerCase();
  if (VERB_KEYS.has(lower)) {
    return lower.toUpperCase();
  }
  return "POST";
}
function isVerbLeaf(leaf) {
  return VERB_KEYS.has(leaf.key.toLowerCase()) && leaf.http?.method === undefined;
}
function segmentForNode(node) {
  return node.http?.segment ?? node.key;
}
function leafHttpExposed(leaf) {
  if (isHttpDisabled(leaf) || isHttpHidden(leaf)) {
    return false;
  }
  return true;
}
function pushRoute(routes, leaf, state, pathPrefix) {
  const urlSegments = [...state.urlSegments];
  const commandPath = [...state.commandPath];
  if (!isVerbLeaf(leaf)) {
    const seg = segmentForNode(leaf);
    if (urlSegments[urlSegments.length - 1] !== seg) {
      urlSegments.push(seg);
    }
    if (commandPath[commandPath.length - 1] !== leaf.key) {
      commandPath.push(leaf.key);
    }
  }
  const openApiPath = buildHttpUserPath(pathPrefix, urlSegments);
  const patternParts = urlSegments.map((s) => s.startsWith(":") ? "([^/]+)" : escapeRegex(s));
  const regexPrefix = httpUserPathRegexPrefix(pathPrefix);
  const tail = patternParts.length > 0 ? `/${patternParts.join("/")}` : "";
  const pathPattern = new RegExp(`^${regexPrefix}${tail}/?$`);
  routes.push({
    method: inferHttpMethod(leaf),
    openApiPath,
    pathPattern,
    commandPath,
    paramNames: [...state.paramNames],
    leaf
  });
}
function walk(node, state, routes, pathPrefix) {
  if (isHttpDisabled(node) || isHttpHidden(node)) {
    return;
  }
  if (isCliLeaf(node)) {
    if (leafHttpExposed(node)) {
      pushRoute(routes, node, state, pathPrefix);
    }
    return;
  }
  for (const child of node.commands) {
    if (isParamRouterKey(child.key)) {
      const paramName = child.key.slice(1);
      walk(child, {
        urlSegments: [...state.urlSegments, child.key],
        commandPath: [...state.commandPath, child.key],
        paramNames: [...state.paramNames, paramName]
      }, routes, pathPrefix);
      continue;
    }
    if (isCliLeaf(child)) {
      walk(child, {
        urlSegments: state.urlSegments,
        commandPath: [...state.commandPath, child.key],
        paramNames: state.paramNames
      }, routes, pathPrefix);
      continue;
    }
    const seg = segmentForNode(child);
    walk(child, {
      urlSegments: [...state.urlSegments, seg],
      commandPath: [...state.commandPath, child.key],
      paramNames: state.paramNames
    }, routes, pathPrefix);
  }
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function collectHttpRoutes(program) {
  const routes = [];
  if (!program.httpServer?.enabled) {
    return routes;
  }
  const pathPrefix = resolveHttpPathPrefix(program);
  if (isCliLeaf(program)) {
    walk(program, { urlSegments: [], commandPath: [], paramNames: [] }, routes, pathPrefix);
    return routes;
  }
  for (const child of program.commands) {
    if (child.key === "completion" || child.key === "configure" || child.key === "docs" || child.key === "mcp" || child.key === "version" || child.key === "http") {
      continue;
    }
    if (isCliLeaf(child)) {
      walk(child, { urlSegments: [], commandPath: [child.key], paramNames: [] }, routes, pathPrefix);
    } else {
      walk(child, { urlSegments: [segmentForNode(child)], commandPath: [child.key], paramNames: [] }, routes, pathPrefix);
    }
  }
  return routes;
}
function matchHttpRoute(program, method, pathname) {
  const routes = collectHttpRoutes(program);
  const upper = method.toUpperCase();
  let best;
  for (const route of routes) {
    if (route.method !== upper) {
      continue;
    }
    const m = route.pathPattern.exec(pathname);
    if (!m) {
      continue;
    }
    const pathParams = {};
    for (let i = 0;i < route.paramNames.length; i++) {
      const name = route.paramNames[i];
      const val = m[i + 1];
      if (name && val !== undefined) {
        pathParams[name] = decodeURIComponent(val);
      }
    }
    const score = route.openApiPath.length;
    if (!best || score > best.score) {
      best = { route, pathParams, score };
    }
  }
  if (!best) {
    return { ok: false };
  }
  return { ok: true, route: best.route, pathParams: best.pathParams };
}
function httpRequestToArgv(_program, route, pathParams, query, body) {
  const argv = [];
  for (const key of route.commandPath) {
    if (isParamRouterKey(key)) {
      const name = key.slice(1);
      const val = pathParams[name];
      if (val === undefined || val.length === 0) {
        return { error: `Missing path parameter: ${name}` };
      }
      argv.push(val);
    } else {
      argv.push(key);
    }
  }
  const leaf = route.leaf;
  if (isDocumentLeaf(leaf)) {
    return argv;
  }
  const merged = { ...body, ...query };
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
      try {
        merged[k] = JSON.parse(v);
      } catch {
        merged[k] = v;
      }
    }
  }
  for (const opt of leafWireOptions(leaf)) {
    if (opt.kind === "json" /* Json */) {
      continue;
    }
    const val = merged[opt.name];
    if (val === undefined) {
      continue;
    }
    if (opt.kind === "presence" /* Presence */) {
      if (val === true || val === "true" || val === "1") {
        argv.push(`--${opt.name}`);
      }
      continue;
    }
    const formatted = formatMcpOptionValue(opt, val);
    if (typeof formatted !== "string") {
      return formatted;
    }
    argv.push(`--${opt.name}`, formatted);
  }
  if (leafHasYesOption(leaf) && !argv.includes("--yes")) {
    argv.push("--yes");
  }
  for (const p of leaf.positionals ?? []) {
    const val = merged[p.name] ?? pathParams[p.name];
    const { argMin = 1, argMax = 1 } = p;
    if (argMax === 0) {
      const raw = merged[p.name];
      if (raw === undefined) {
        if (argMin >= 1) {
          return { error: `Missing argument: ${p.name} (use a JSON array)` };
        }
        continue;
      }
      if (!Array.isArray(raw)) {
        return { error: `Argument ${p.name} must be a JSON array of strings` };
      }
      const items = raw.map(String).filter(Boolean);
      if (items.length === 0 && argMin >= 1) {
        return { error: `Missing argument: ${p.name}` };
      }
      argv.push(...items);
      continue;
    }
    if (val === undefined || val === "") {
      if (argMin >= 1) {
        return { error: `Missing argument: ${p.name}` };
      }
      continue;
    }
    argv.push(String(val));
  }
  return argv;
}
function defaultSuccessStatus(method, hasBody) {
  switch (method) {
    case "GET":
      return 200;
    case "POST":
      return 201;
    case "PUT":
    case "PATCH":
      return 200;
    case "DELETE":
      return hasBody ? 200 : 204;
    default:
      return 200;
  }
}

// ../../src/http/schema-deref.ts
function decodeJsonPointerSegment(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function resolveJsonPointer(root, ref) {
  if (!ref.startsWith("#/")) {
    return;
  }
  const segments = ref.slice(2).split("/").filter((segment) => segment.length > 0).map(decodeJsonPointerSegment);
  let current = root;
  for (const segment of segments) {
    if (!isPlainObject(current)) {
      return;
    }
    current = current[segment];
  }
  return current;
}
function derefValue(value, root, resolving) {
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
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "definitions" || key === "$defs") {
      continue;
    }
    out[key] = derefValue(child, root, resolving);
  }
  return out;
}
function dereferenceJsonSchema(schema) {
  const root = structuredClone(schema);
  return derefValue(root, root, new Set);
}

// ../../src/http/openapi.ts
var JSON_CONTENT_TYPE = "application/json; charset=utf-8";
function defaultErrorSchema() {
  return {
    type: "object",
    properties: { error: { type: "string" } },
    required: ["error"]
  };
}
function errorResponseSchema(program) {
  const custom = program.httpServer?.errors?.errorSchema;
  return custom ? dereferenceJsonSchema(custom) : defaultErrorSchema();
}
function errorResponseEntry(program, description) {
  return {
    description,
    content: {
      [JSON_CONTENT_TYPE]: {
        schema: errorResponseSchema(program)
      }
    }
  };
}
function buildSuccessResponses(route) {
  const contentType = route.leaf.http?.successContentType ?? "application/json";
  const media = {};
  const method = route.method;
  if (contentType.includes("application/json")) {
    const outputSchema = route.leaf.outputSchema ?? { type: "object" };
    media[contentType] = {
      schema: dereferenceJsonSchema(outputSchema)
    };
  } else if (contentType.includes("text/html")) {
    media[contentType] = { schema: { type: "string" } };
  } else {
    media[contentType] = { schema: { type: "string", format: "binary" } };
  }
  const status = String(route.leaf.http?.successStatus ?? defaultSuccessStatus(method, method !== "DELETE"));
  if (method === "DELETE" && status === "204") {
    return {
      "204": { description: "Successful invocation" }
    };
  }
  return {
    [status]: {
      description: "Successful invocation",
      content: media
    }
  };
}
function methodLower(method) {
  return method.toLowerCase();
}
var HEALTH_TAG = "health";
var livenessResponseSchema = {
  type: "object",
  properties: { ok: { type: "boolean", const: true } },
  required: ["ok"]
};
var readinessCheckSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    error: { type: "string" },
    missing: { type: "array", items: { type: "string" } }
  },
  required: ["ok"]
};
var readinessResponseSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    checks: {
      type: "object",
      properties: {
        config_file: readinessCheckSchema,
        config_required: readinessCheckSchema,
        custom: readinessCheckSchema
      },
      required: ["config_file", "config_required", "custom"]
    }
  },
  required: ["ok", "checks"]
};
function jsonResponseEntry(description, schema) {
  return {
    description,
    content: {
      [JSON_CONTENT_TYPE]: { schema }
    }
  };
}
function livenessGetOp() {
  return {
    tags: [HEALTH_TAG],
    operationId: "health_liveness",
    summary: "Liveness probe",
    description: "Returns 200 when the HTTP server is online and accepting requests. Does not run config or readiness checks — use for orchestrator liveness probes only.",
    responses: {
      "200": jsonResponseEntry("Server is online", livenessResponseSchema)
    }
  };
}
function buildHealthPaths() {
  return {
    "/health/liveness": {
      get: livenessGetOp()
    },
    "/health/readiness": {
      get: {
        tags: [HEALTH_TAG],
        operationId: "health_readiness",
        summary: "Readiness probe",
        description: "Returns 200 when the server is online and all readiness checks pass (config file, required app config, and optional program.readiness). Returns 503 when any check fails — use for orchestrator readiness probes before routing traffic.",
        responses: {
          "200": jsonResponseEntry("Online and ready to serve traffic", readinessResponseSchema),
          "503": jsonResponseEntry("Online but not ready (one or more checks failed)", readinessResponseSchema)
        }
      }
    }
  };
}
function topLevelCommandKey(route, program) {
  const key = route.commandPath.find((k) => !k.startsWith(":"));
  return key ?? program.key;
}
function findTopLevelCommand(program, key) {
  if (isCliLeaf(program)) {
    return program.key === key ? program : undefined;
  }
  return program.commands.find((c) => c.key === key);
}
function collectCommandTags(program, routes) {
  const names = [...new Set(routes.map((route) => topLevelCommandKey(route, program)))].sort();
  return names.map((name) => {
    const node = findTopLevelCommand(program, name);
    return node?.description ? { name, description: node.description } : { name };
  });
}
function generateOpenApi(program) {
  const routes = collectHttpRoutes(program);
  const paths = program.httpServer?.enabled ? buildHealthPaths() : {};
  const commandTags = collectCommandTags(program, routes);
  for (const route of routes) {
    const pathKey = route.openApiPath;
    const existing = paths[pathKey] ?? {};
    const op = {
      tags: [topLevelCommandKey(route, program)],
      operationId: route.openApiPath.replace(/\//g, "_").replace(/[{}]/g, ""),
      summary: route.leaf.description ?? route.leaf.key,
      responses: {
        ...buildSuccessResponses(route),
        "400": errorResponseEntry(program, "Invalid arguments or help requested"),
        "404": errorResponseEntry(program, "Not found"),
        "500": errorResponseEntry(program, "Handler error"),
        "503": errorResponseEntry(program, "Not ready or missing required config")
      }
    };
    if (route.paramNames.length > 0) {
      op.parameters = route.paramNames.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" }
      }));
    }
    const method = methodLower(route.method);
    if (method === "get" || method === "delete") {
      op.parameters = [
        ...op.parameters ?? [],
        ...leafWireOptions(route.leaf).map((opt) => ({
          name: opt.name,
          in: "query",
          required: opt.required ?? false,
          schema: { type: "string" },
          description: opt.description
        }))
      ];
    } else {
      op.requestBody = {
        required: isDocumentLeaf(route.leaf),
        content: {
          [JSON_CONTENT_TYPE]: {
            schema: dereferenceJsonSchema(buildLeafInputSchema(route.leaf))
          }
        }
      };
    }
    existing[method] = op;
    paths[pathKey] = existing;
  }
  return {
    openapi: "3.1.0",
    info: {
      title: program.key,
      version: program.version,
      description: program.description
    },
    ...program.httpServer?.enabled ? {
      tags: [
        {
          name: HEALTH_TAG,
          description: "Orchestrator health probes — liveness (online) vs readiness (online + checks passed)."
        },
        ...commandTags
      ]
    } : {},
    paths
  };
}
function openApiJson(program) {
  return `${JSON.stringify(generateOpenApi(program), null, 2)}
`;
}

// ../../src/help.ts
var style = {
  wrap(prefix, body, suffix) {
    return prefix + body + suffix;
  },
  red(msg) {
    return this.wrap("\x1B[31m", msg, "\x1B[0m");
  },
  gray(msg) {
    return this.wrap("\x1B[90m", msg, "\x1B[0m");
  },
  bold(msg) {
    return this.wrap("\x1B[1m", msg, "\x1B[0m");
  },
  white(msg) {
    return this.wrap("\x1B[37m", msg, "\x1B[0m");
  },
  aquaBold(msg) {
    return this.wrap("\x1B[96m\x1B[1m", msg, "\x1B[0m");
  },
  greenBright(msg) {
    return this.wrap("\x1B[92m", msg, "\x1B[0m");
  },
  grayBoldTitle(title) {
    return this.gray(this.bold(title));
  }
};
var kBoxTL = "╭";
var kBoxTR = "╮";
var kBoxV = "│";
var kBoxBL = "╰";
var kBoxBR = "╯";
var kBoxH = "─";
function getHelpWidth() {
  return Math.max(40, process.stdout.columns || 80);
}
function isOutputTTY(useStderr) {
  return useStderr ? !!process.stderr.isTTY : !!process.stdout.isTTY;
}
function visibleWidth(s) {
  let w = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\x1B" && i + 1 < s.length && s[i + 1] === "[") {
      i += 2;
      while (i < s.length && s[i] !== "m") {
        i += 1;
      }
      if (i < s.length)
        i += 1;
      continue;
    }
    w += 1;
    i += 1;
  }
  return w;
}
function repeatBoxH(n) {
  return kBoxH.repeat(Math.max(0, n));
}
function spaces(n) {
  return " ".repeat(Math.max(0, n));
}
function padVisible(s, width) {
  return s + spaces(Math.max(0, width - visibleWidth(s)));
}
function wrapParagraph(text, width) {
  const available = Math.max(1, width);
  const out = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter((w) => w.length > 0)) {
    if (cur.length === 0) {
      cur = word;
      continue;
    }
    if (cur.length + 1 + word.length <= available) {
      cur += ` ${word}`;
    } else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur.length > 0)
    out.push(cur);
  return out;
}
function wrapText(text, width) {
  const out = [];
  const lines = text.split(`
`);
  for (const line of lines) {
    if (line.trim().length === 0) {
      out.push("");
      continue;
    }
    if (line[0] === " " || line[0] === "\t") {
      out.push(line);
      continue;
    }
    out.push(...wrapParagraph(line, width));
  }
  if (out.length === 0)
    out.push("");
  return out;
}
function optKindLabel(k, o) {
  switch (k) {
    case "presence" /* Presence */:
      return "";
    case "number" /* Number */:
      return " <number>";
    case "string" /* String */:
      return " <string>";
    case "enum" /* Enum */: {
      const choices = o?.choices ?? [];
      if (choices.length === 0) {
        return " <choice>";
      }
      if (choices.length <= 4) {
        return ` <${choices.join("|")}>`;
      }
      return ` <${choices.slice(0, 3).join("|")}|…>`;
    }
    case "json" /* Json */:
      return " <json>";
  }
}
function cliOptionLabel(o, color) {
  let r = `--${o.name}${optKindLabel(o.kind, o)}`;
  if (o.shortName)
    r += `, -${o.shortName}`;
  if (!color)
    return r;
  const sepIdx = r.indexOf(", ");
  if (sepIdx === -1)
    return style.aquaBold(r);
  const left = r.slice(0, sepIdx);
  const right = r.slice(sepIdx + 2);
  return `${style.aquaBold(left)} ${style.greenBright(right)}`;
}
var CLI_NOTES_PROGRAM = "{argsbarg:program}";
function cliResolveNotes(notes, appKey) {
  return notes.replaceAll(CLI_NOTES_PROGRAM, appKey);
}
function cliPositionalLabel(p, color) {
  const { argMin = 1, argMax = 1 } = p;
  let r;
  if (argMax === 1) {
    r = argMin === 0 ? `[${p.name}]` : `<${p.name}>`;
  } else {
    r = argMin === 0 ? `[${p.name}...]` : `<${p.name}...>`;
  }
  if (!color)
    return r;
  return style.aquaBold(r);
}
function renderTextBox(title, lines, hw, color) {
  if (lines.length === 0)
    return [];
  const titleLead = color ? style.gray(`${kBoxH} `) + style.grayBoldTitle(title) + style.gray(" ") : `${kBoxH} ${title} `;
  let contentWidth = Math.max(visibleWidth(titleLead) + 1, hw - 4);
  for (const line of lines) {
    contentWidth = Math.max(contentWidth, visibleWidth(line));
  }
  const borderWidth = contentWidth + 2;
  const headerFill = Math.max(1, borderWidth - visibleWidth(titleLead));
  const out = [];
  out.push((color ? style.gray(kBoxTL) : kBoxTL) + titleLead + (color ? style.gray(repeatBoxH(headerFill) + kBoxTR) : repeatBoxH(headerFill) + kBoxTR));
  for (const line of lines) {
    const padded = padVisible(line, contentWidth);
    out.push(`${color ? style.gray(kBoxV) : kBoxV} ${padded} ${color ? style.gray(kBoxV) : kBoxV}`);
  }
  out.push(color ? style.gray(kBoxBL + repeatBoxH(borderWidth) + kBoxBR) : kBoxBL + repeatBoxH(borderWidth) + kBoxBR);
  return out;
}
function renderTableBox(title, rows, hw, color) {
  if (rows.length === 0)
    return [];
  let labelWidth = 0;
  for (const row of rows) {
    labelWidth = Math.max(labelWidth, visibleWidth(row.label));
  }
  let titleLead;
  if (color) {
    titleLead = style.gray(`${kBoxH} `) + style.grayBoldTitle(title) + style.gray(" ");
  } else {
    titleLead = `${kBoxH} ${title} `;
  }
  const targetContentWidth = Math.max(visibleWidth(titleLead) + 1, hw - 4);
  const descWidth = Math.max(1, targetContentWidth - labelWidth - 2);
  const bodyLines = [];
  for (const row of rows) {
    const wrapped = wrapText(row.description, descWidth);
    const first = `${row.label + spaces(labelWidth - visibleWidth(row.label))}  ${color ? style.white(wrapped[0]) : wrapped[0]}`;
    bodyLines.push(first);
    for (let idx = 1;idx < wrapped.length; idx++) {
      const pad = color ? style.gray(spaces(labelWidth)) : spaces(labelWidth);
      bodyLines.push(`${pad}  ${color ? style.white(wrapped[idx]) : wrapped[idx]}`);
    }
  }
  let contentWidth = targetContentWidth;
  for (const line of bodyLines) {
    contentWidth = Math.max(contentWidth, visibleWidth(line));
  }
  const borderWidth = contentWidth + 2;
  const headerFill = Math.max(1, borderWidth - visibleWidth(titleLead));
  const out = [];
  out.push((color ? style.gray(kBoxTL) : kBoxTL) + titleLead + (color ? style.gray(repeatBoxH(headerFill) + kBoxTR) : repeatBoxH(headerFill) + kBoxTR));
  for (const line of bodyLines) {
    const padded = padVisible(line, contentWidth);
    out.push(`${color ? style.gray(kBoxV) : kBoxV} ${padded} ${color ? style.gray(kBoxV) : kBoxV}`);
  }
  out.push(color ? style.gray(kBoxBL + repeatBoxH(borderWidth) + kBoxBR) : kBoxBL + repeatBoxH(borderWidth) + kBoxBR);
  return out;
}
function renderPlainSection(title, lines) {
  if (lines.length === 0)
    return [];
  const out = [`${title}:`];
  for (const line of lines) {
    out.push(line.length > 0 ? `  ${line}` : "");
  }
  return out;
}
function renderPlainTable(title, rows, hw) {
  if (rows.length === 0)
    return [];
  let labelWidth = 0;
  for (const row of rows) {
    labelWidth = Math.max(labelWidth, visibleWidth(row.label));
  }
  const descWidth = Math.max(20, hw - labelWidth - 4);
  const out = [`${title}:`];
  for (const row of rows) {
    const wrapped = wrapText(row.description, descWidth);
    const paddedLabel = padVisible(row.label, labelWidth);
    if (wrapped.length === 0 || wrapped[0].length === 0) {
      out.push(`  ${row.label}`);
    } else {
      out.push(`  ${paddedLabel}  ${wrapped[0]}`);
      for (let idx = 1;idx < wrapped.length; idx++) {
        out.push(`  ${spaces(labelWidth)}  ${wrapped[idx]}`);
      }
    }
  }
  return out;
}
function usageLines(appName, helpPath, hasCommands, hasArgs, documentLeaf, color, leafKind) {
  let fullPath = appName;
  for (const seg of helpPath) {
    fullPath += ` ${seg}`;
  }
  const usageOpts = color ? style.aquaBold("[OPTIONS]") : "[OPTIONS]";
  const usageCmd = color ? style.aquaBold("COMMAND") : "COMMAND";
  const usageArgs = color ? style.aquaBold("[ARGS]...") : "[ARGS]...";
  const docTag = leafKind === "document" ? "[DOCUMENT]" : "[JSON]";
  const usageDoc = color ? style.aquaBold(docTag) : docTag;
  const out = [];
  if (helpPath.length === 0) {
    if (hasCommands) {
      out.push(`${fullPath} ${usageOpts} ${usageCmd} ${usageArgs}`);
    } else {
      out.push(`${fullPath} ${usageOpts}`);
    }
    return out;
  }
  if (documentLeaf) {
    out.push(`${fullPath} ${usageDoc}`);
    return out;
  }
  out.push(`${fullPath} ${usageOpts}${hasArgs ? ` ${usageArgs}` : ""}`);
  if (hasCommands) {
    out.push(`${fullPath} ${usageCmd} ${usageArgs}`);
  }
  return out;
}
function rowsForJsonInput(inputSchema, kind) {
  const hint = "Pass a JSON or YAML document as an argument or pipe to stdin.";
  const label = kind === "document" ? "DOCUMENT" : "JSON";
  const rows = [{ label, description: hint }];
  const props = inputSchema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return rows;
  }
  const required = new Set(Array.isArray(inputSchema?.required) ? inputSchema.required.map((k) => String(k)) : []);
  for (const [name, prop] of Object.entries(props)) {
    const desc = prop.description ?? "";
    rows.push({
      label: name,
      description: required.has(name) ? `(required) ${desc}` : desc
    });
  }
  return rows;
}
function rowsForOptions(defs, color) {
  const rows = [];
  const helpLabel = color ? style.aquaBold("--help, ") + style.greenBright("-h") : "--help, -h";
  rows.push({ label: helpLabel, description: "Show help for this command." });
  for (const o of defs) {
    const desc = o.required ? `(required) ${o.description}` : o.description;
    rows.push({ label: cliOptionLabel(o, color), description: desc });
  }
  return rows;
}
function rowsForPositionals(defs, color) {
  return defs.map((p) => ({ label: cliPositionalLabel(p, color), description: p.description }));
}
function rowsForSubcommands(cmds) {
  return visibleSubcommands(cmds).sort((a, b) => a.key.localeCompare(b.key)).map((c) => ({ label: c.key, description: c.description }));
}
function resolveRef(ref, defs) {
  const name = ref.replace(/^#\/(definitions|\$defs)\//, "");
  const target = defs[name];
  if (typeof target === "object" && target !== null) {
    return target;
  }
  return null;
}
function formatType(schema, defs, seen) {
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.replace(/^#\/(definitions|\$defs)\//, "");
    if (seen.has(name)) {
      return name;
    }
    seen.add(name);
    const resolved = resolveRef(schema.$ref, defs);
    const res = resolved ? formatType(resolved, defs, seen) : name;
    seen.delete(name);
    return res;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((v) => typeof v === "string" ? JSON.stringify(v) : String(v)).join(" | ");
  }
  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union) && union.length > 0) {
    const parts = [];
    let allSimple = true;
    for (const variant of union) {
      if (typeof variant === "object" && variant !== null) {
        const formatted = formatType(variant, defs, seen);
        if (formatted !== null) {
          parts.push(formatted);
        } else {
          allSimple = false;
          break;
        }
      }
    }
    if (allSimple && parts.length > 0) {
      return parts.join(" | ");
    }
  }
  if (Array.isArray(schema.type)) {
    return schema.type.join(" | ");
  }
  if (schema.type === "string") {
    if (typeof schema.format === "string") {
      return `string (${schema.format})`;
    }
    return "string";
  }
  if (schema.type === "number")
    return "number";
  if (schema.type === "integer")
    return "integer";
  if (schema.type === "boolean")
    return "boolean";
  if (schema.type === "null")
    return "null";
  if (schema.type === "array" && schema.items && typeof schema.items === "object") {
    const itemType = formatType(schema.items, defs, seen);
    if (itemType !== null) {
      if (itemType.includes(" | ")) {
        return `(${itemType})[]`;
      }
      return `${itemType}[]`;
    }
    return null;
  }
  if (schema.type === "object" || schema.properties !== undefined) {
    if (schema.properties && typeof schema.properties === "object" && Object.keys(schema.properties).length > 0) {
      return null;
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      const valType = formatType(schema.additionalProperties, defs, seen) ?? "object";
      return `{ [key: string]: ${valType} }`;
    }
    return "object";
  }
  return null;
}
function formatSchemaLines(schema, defs, indent, seen) {
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.replace(/^#\/(definitions|\$defs)\//, "");
    if (seen.has(name)) {
      return [`${spaces(indent)}${name}`];
    }
    seen.add(name);
    const resolved = resolveRef(schema.$ref, defs);
    const res = resolved ? formatSchemaLines(resolved, defs, indent, seen) : [`${spaces(indent)}${name}`];
    seen.delete(name);
    return res;
  }
  if (schema.type === "object" || schema.properties !== undefined) {
    const props = schema.properties ?? {};
    const required = new Set(Array.isArray(schema.required) ? schema.required.map((k) => String(k)) : []);
    const propEntries = Object.entries(props);
    if (propEntries.length === 0) {
      const simple = formatType(schema, defs, seen);
      return simple ? [`${spaces(indent)}${simple}`] : [`${spaces(indent)}{}`];
    }
    const lines = [];
    for (const [key, prop] of propEntries) {
      if (typeof prop !== "object" || prop === null)
        continue;
      const desc = typeof prop.description === "string" ? prop.description.trim() : "";
      if (desc.length > 0) {
        for (const dLine of desc.split(`
`)) {
          lines.push(`${spaces(indent)}# ${dLine.trim()}`);
        }
      }
      const isReq = required.has(key);
      const keyStr = isReq ? key : `${key}?`;
      const simple = formatType(prop, defs, seen);
      if (simple !== null) {
        lines.push(`${spaces(indent)}${keyStr}: ${simple}`);
      } else {
        if (prop.type === "array" && prop.items && typeof prop.items === "object") {
          lines.push(`${spaces(indent)}${keyStr}:`);
          const itemSchema = prop.items;
          const itemLines = formatSchemaLines(itemSchema, defs, 0, seen);
          if (itemLines.length > 0) {
            lines.push(`${spaces(indent + 2)}- ${itemLines[0]}`);
            for (let i = 1;i < itemLines.length; i++) {
              lines.push(`${spaces(indent + 4)}${itemLines[i]}`);
            }
          } else {
            lines.push(`${spaces(indent + 2)}- {}`);
          }
        } else {
          lines.push(`${spaces(indent)}${keyStr}:`);
          const childLines = formatSchemaLines(prop, defs, indent + 2, seen);
          lines.push(...childLines);
        }
      }
    }
    return lines;
  }
  if (schema.type === "array") {
    if (schema.items && typeof schema.items === "object") {
      const itemSchema = schema.items;
      const simple = formatType(itemSchema, defs, seen);
      if (simple !== null) {
        return [`${spaces(indent)}- ${simple}`];
      }
      const itemLines = formatSchemaLines(itemSchema, defs, 0, seen);
      if (itemLines.length > 0) {
        const out = [`${spaces(indent)}- ${itemLines[0]}`];
        for (let i = 1;i < itemLines.length; i++) {
          out.push(`${spaces(indent + 2)}${itemLines[i]}`);
        }
        return out;
      }
      return [`${spaces(indent)}- {}`];
    }
    return [`${spaces(indent)}array`];
  }
  const fallback = formatType(schema, defs, seen);
  return fallback ? [`${spaces(indent)}${fallback}`] : [`${spaces(indent)}object`];
}
function schemaToYamlLines(schema, indent = 0) {
  const defs = schema.definitions ?? schema.$defs ?? {};
  const lines = [];
  if (typeof schema.description === "string" && schema.description.trim().length > 0) {
    for (const dLine of schema.description.trim().split(`
`)) {
      lines.push(`${spaces(indent)}# ${dLine.trim()}`);
    }
  }
  lines.push(...formatSchemaLines(schema, defs, indent, new Set));
  return lines;
}
function appendNotesBox(lines, notes, appKey, hw, color, isTTY) {
  if ((notes ?? "").length === 0) {
    return;
  }
  const resolved = cliResolveNotes(notes ?? "", appKey);
  lines.push("");
  if (isTTY) {
    lines.push(renderTextBox("Notes", wrapText(resolved, hw - 4), hw, color).join(`
`));
  } else {
    lines.push(renderPlainSection("Notes", wrapText(resolved, hw - 4)).join(`
`));
  }
}
function cliHelpRender(schema, helpPath, useStderr, opts) {
  const hw = getHelpWidth();
  const isTTY = opts?.isTTY ?? isOutputTTY(useStderr);
  const color = isTTY;
  const showSchema = opts?.showSchema ?? !isTTY;
  if (helpPath.length === 0) {
    const lines2 = [];
    lines2.push("");
    if (schema.description.length > 0) {
      lines2.push(color ? style.white(schema.description) : schema.description);
      lines2.push("");
    }
    const usage2 = usageLines(schema.key, helpPath, (schema.commands ?? []).length > 0, false, false, color);
    if (isTTY) {
      lines2.push(renderTextBox("Usage", usage2, hw, color).join(`
`));
    } else {
      lines2.push(renderPlainSection("Usage", usage2).join(`
`));
    }
    const optRows = rowsForOptions(visibleOptions(schema.options), color);
    const optBox = isTTY ? renderTableBox("Options", optRows, hw, color) : renderPlainTable("Options", optRows, hw);
    if (optBox.length > 0) {
      lines2.push("");
      lines2.push(optBox.join(`
`));
    }
    if ((schema.commands ?? []).length > 0) {
      const subRows2 = rowsForSubcommands(schema.commands ?? []);
      const subBox2 = isTTY ? renderTableBox("Commands", subRows2, hw, color) : renderPlainTable("Commands", subRows2, hw);
      lines2.push("");
      lines2.push(subBox2.join(`
`));
    }
    if (isCliLeaf(schema) && showSchema) {
      const leaf = schema;
      if (leaf.outputSchema !== undefined) {
        const title = isDocumentLeaf(leaf) ? "Output Schema (JSON)" : "Output Schema (with --json)";
        const yamlLines = schemaToYamlLines(leaf.outputSchema, 0);
        if (yamlLines.length > 0) {
          lines2.push("");
          if (isTTY) {
            lines2.push(renderTextBox(title, yamlLines, hw, color).join(`
`));
          } else {
            lines2.push(renderPlainSection(title, yamlLines).join(`
`));
          }
        }
      }
    }
    appendNotesBox(lines2, schema.notes, schema.key, hw, color, isTTY);
    return `${lines2.join(`
`)}

`;
  }
  let layer = schema.commands ?? [];
  let node;
  for (const seg of helpPath) {
    const ch = layer.find((c) => c.key === seg);
    if (!ch) {
      return `${color ? style.red("Unknown help path.") : "Unknown help path."}
`;
    }
    node = ch;
    layer = isCliRouter(ch) ? ch.commands : [];
  }
  if (!node) {
    return `${color ? style.red("Unknown help path.") : "Unknown help path."}
`;
  }
  const lines = [];
  lines.push("");
  if (node.description.length > 0) {
    lines.push(color ? style.white(node.description) : node.description);
    lines.push("");
  }
  const nodeIsDocumentLeaf = isCliLeaf(node) && isDocumentLeaf(node);
  const usage = usageLines(schema.key, helpPath, isCliRouter(node) && node.commands.length > 0, isCliLeaf(node) && (node.positionals ?? []).length > 0, nodeIsDocumentLeaf, color, isCliLeaf(node) ? node.kind : undefined);
  if (isTTY) {
    lines.push(renderTextBox("Usage", usage, hw, color).join(`
`));
  } else {
    lines.push(renderPlainSection("Usage", usage).join(`
`));
  }
  if (nodeIsDocumentLeaf && isCliLeaf(node)) {
    const inputRows = rowsForJsonInput(node.inputSchema, node.kind);
    const inputBox = isTTY ? renderTableBox("Input", inputRows, hw, color) : renderPlainTable("Input", inputRows, hw);
    if (inputBox.length > 0) {
      lines.push("");
      lines.push(inputBox.join(`
`));
    }
    if (showSchema && node.inputSchema !== undefined) {
      const yamlLines = schemaToYamlLines(node.inputSchema, 0);
      if (yamlLines.length > 0) {
        lines.push("");
        if (isTTY) {
          lines.push(renderTextBox("Input Schema", yamlLines, hw, color).join(`
`));
        } else {
          lines.push(renderPlainSection("Input Schema", yamlLines).join(`
`));
        }
      }
    }
  } else {
    const optRows = rowsForOptions(visibleOptions(node.options), color);
    const optBox = isTTY ? renderTableBox("Options", optRows, hw, color) : renderPlainTable("Options", optRows, hw);
    if (optBox.length > 0) {
      lines.push("");
      lines.push(optBox.join(`
`));
    }
    const posRows = rowsForPositionals(isCliLeaf(node) ? node.positionals ?? [] : [], color);
    const posBox = isTTY ? renderTableBox("Arguments", posRows, hw, color) : renderPlainTable("Arguments", posRows, hw);
    if (posBox.length > 0) {
      lines.push("");
      lines.push(posBox.join(`
`));
    }
  }
  const subcmds = isCliRouter(node) ? node.commands : [];
  const subRows = rowsForSubcommands(subcmds);
  const subBox = isTTY ? renderTableBox("Subcommands", subRows, hw, color) : renderPlainTable("Subcommands", subRows, hw);
  if (subBox.length > 0) {
    lines.push("");
    lines.push(subBox.join(`
`));
  }
  if (isCliLeaf(node) && node.outputSchema !== undefined && showSchema) {
    const title = nodeIsDocumentLeaf ? "Output Schema (JSON)" : "Output Schema (with --json)";
    const yamlLines = schemaToYamlLines(node.outputSchema, 0);
    if (yamlLines.length > 0) {
      lines.push("");
      if (isTTY) {
        lines.push(renderTextBox(title, yamlLines, hw, color).join(`
`));
      } else {
        lines.push(renderPlainSection(title, yamlLines).join(`
`));
      }
    }
  }
  if ((node.notes ?? "").length > 0) {
    appendNotesBox(lines, node.notes, schema.key, hw, color, isTTY);
  }
  return `${lines.join(`
`)}

`;
}

// ../../src/docs/cli-guide.ts
function commandPath(rootKey, path) {
  if (path.length === 0) {
    return rootKey;
  }
  return [rootKey, ...path].join(" ");
}
function optionType(opt) {
  if (opt.kind === "presence" /* Presence */) {
    return "flag";
  }
  if (opt.kind === "enum" /* Enum */) {
    return `enum (\`${(opt.choices ?? []).join("`, `")}\`)`;
  }
  return opt.kind;
}
function optionFormatDefault(opt) {
  const parts = [];
  if (opt.format !== undefined) {
    parts.push(opt.format);
  }
  if (opt.default !== undefined) {
    parts.push(`default \`${opt.default}\``);
  }
  if (opt.pattern !== undefined) {
    parts.push(`pattern \`${opt.pattern}\``);
  }
  return parts.length > 0 ? parts.join("; ") : "—";
}
function optionLabel(opt) {
  const long = `\`--${opt.name}\``;
  const short = opt.shortName ? ` (\`-${opt.shortName}\`)` : "";
  return `${long}${short}`;
}
function formatOptionRow(opt) {
  const req = opt.required ? "required" : "optional";
  return `| ${optionLabel(opt)} | ${optionType(opt)} | ${req} | ${optionFormatDefault(opt)} | ${opt.description} |`;
}
function formatPositionalRow(p) {
  const label = cliPositionalLabel(p, false);
  const req = (p.argMin ?? 1) > 0 ? "required" : "optional";
  return `| \`${label}\` | ${p.kind} | ${req} | ${p.description} |`;
}
function formatNotesBlockquote(notes, appKey) {
  const resolved = cliResolveNotes(notes, appKey);
  return resolved.split(`
`).map((line) => `> ${line}`).join(`
`);
}
function formatOutputSchemaSection(schema) {
  return [
    "#### Output",
    "",
    "JSON Schema for output when/if handler emits JSON",
    "",
    "```json",
    JSON.stringify(schema, null, 2),
    "```",
    ""
  ];
}
function fallbackLine(node) {
  if (node.fallbackCommand === undefined) {
    return null;
  }
  const mode = node.fallbackMode ?? "missingOnly" /* MissingOnly */;
  return `**Default subcommand:** \`${node.fallbackCommand}\` (\`${mode}\`)`;
}
function formatOutputSchemaPointer(rootKey) {
  return ["#### Output", "", `See \`${rootKey} docs cli-schema\` for outputSchema when set.`, ""];
}
function renderCommandNode(rootKey, path, node, lines, opts) {
  const level = Math.min(path.length + 2, 6);
  const heading = "#".repeat(level);
  const cmd = commandPath(rootKey, path);
  lines.push(`${heading} \`${cmd}\``, "", node.description, "");
  if (node.notes) {
    lines.push(formatNotesBlockquote(node.notes, rootKey), "");
  }
  const fb = fallbackLine(node);
  if (fb) {
    lines.push(fb, "");
  }
  const isJsonStyleLeaf = opts.compact && (node.options ?? []).length === 0 && (node.positionals ?? []).length === 0 && !node.commands?.length;
  if (isJsonStyleLeaf) {
    lines.push(`Input shape: see \`${rootKey} docs cli-schema\`.`, "");
  } else if ((node.options ?? []).length > 0) {
    lines.push("#### Options", "");
    lines.push("| Option | Type | Required | Format / default | Description |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const opt of node.options ?? []) {
      lines.push(formatOptionRow(opt));
    }
    lines.push("");
  }
  if ((node.positionals ?? []).length > 0) {
    lines.push("#### Positionals", "");
    lines.push("| Argument | Type | Required | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const p of node.positionals ?? []) {
      lines.push(formatPositionalRow(p));
    }
    lines.push("");
  }
  if (node.outputSchema !== undefined) {
    if (opts.compact) {
      lines.push(...formatOutputSchemaPointer(rootKey));
    } else {
      lines.push(...formatOutputSchemaSection(node.outputSchema));
    }
  }
  const children = node.commands ?? [];
  if (children.length > 0) {
    lines.push("#### Subcommands", "");
    for (const child of children) {
      lines.push(`- \`${child.key}\` — ${child.description}`);
    }
    lines.push("");
  }
  for (const child of children) {
    renderCommandNode(rootKey, [...path, child.key], child, lines, opts);
  }
}
function generateCliGuideBody(program, opts = {}) {
  const schema = cliSchemaExport(program);
  const lines = [];
  renderCommandNode(program.key, [], schema, lines, opts);
  return `${lines.join(`
`).trimEnd()}
`;
}
function generateCliGuide(program, opts = {}) {
  const schema = cliSchemaExport(program);
  const lines = [
    `# ${program.key} — CLI API reference`,
    "",
    schema.description,
    "",
    `Machine-readable export: \`${program.key} docs cli-schema\``,
    ""
  ];
  if (schema.notes) {
    lines.push(formatNotesBlockquote(schema.notes, program.key), "");
  }
  lines.push(generateCliGuideBody(program, opts).trimEnd(), "");
  return `${lines.join(`
`).trimEnd()}
`;
}

// ../../src/http/server.ts
import { randomUUID } from "node:crypto";

// ../../src/config/bootstrap.ts
import { readSync as readSync2 } from "node:fs";

// ../../src/prompt.ts
import { readSync } from "node:fs";
function readPromptLine() {
  const buf = Buffer.alloc(4096);
  const n = readSync(0, buf, { length: 4096 });
  return buf.toString("utf8", 0, n).replace(/\r?\n$/, "");
}

// ../../src/config/bindings.ts
var CONFIG_BINDINGS_KEY = "_bindings";
var BINDING_VALUES = new Set(["env", "file", "skip"]);
function isFrameworkConfigKey(key) {
  return key.startsWith("_");
}
function isPresent(value) {
  if (value === undefined || value === null)
    return false;
  if (typeof value === "string" && value.length === 0)
    return false;
  return true;
}
function readBindings(fileData) {
  const raw = fileData[CONFIG_BINDINGS_KEY];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === "string" && BINDING_VALUES.has(val)) {
      out[key] = val;
    }
  }
  return out;
}
function validateBindingsShape(fileData, pathPrefix = "$") {
  const raw = fileData[CONFIG_BINDINGS_KEY];
  if (raw === undefined)
    return [];
  const errors = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${pathPrefix}.${CONFIG_BINDINGS_KEY}: must be object`);
    return errors;
  }
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val !== "string" || !BINDING_VALUES.has(val)) {
      errors.push(`${pathPrefix}.${CONFIG_BINDINGS_KEY}.${key}: must be "env", "file", or "skip"`);
    }
  }
  return errors;
}
function setBinding(fileData, key, binding) {
  const bindings = { ...readBindings(fileData), [key]: binding };
  return { ...fileData, [CONFIG_BINDINGS_KEY]: bindings };
}
function clearFileValue(fileData, key) {
  if (!(key in fileData)) {
    return fileData;
  }
  const next = { ...fileData };
  delete next[key];
  return next;
}
function isKeyAddressed(key, fileData, _entry) {
  const bindings = readBindings(fileData);
  if (bindings[key] === "skip" || bindings[key] === "env" || bindings[key] === "file") {
    return true;
  }
  return isPresent(fileData[key]);
}
function bindingForKey(key, fileData, resolvedPresent) {
  const bindings = readBindings(fileData);
  const b = bindings[key];
  if (b)
    return b;
  if (isPresent(fileData[key]))
    return "file";
  if (resolvedPresent)
    return "env";
  return "missing";
}

// ../../src/config/schema.ts
function synthesizeAllStringSchema(schema) {
  const properties = {};
  const required = [];
  for (const [key, entry] of Object.entries(schema)) {
    const prop = {
      type: "string",
      description: entry.description
    };
    if (entry.default !== undefined) {
      prop.default = entry.default;
    }
    properties[key] = prop;
    if (entry.required !== false) {
      required.push(key);
    }
  }
  const out = {
    type: "object",
    additionalProperties: false,
    properties
  };
  if (required.length > 0) {
    out.required = required;
  }
  return out;
}
function effectiveJsonSchema(program) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  if (appConfig.jsonSchema !== undefined) {
    return appConfig.jsonSchema;
  }
  return synthesizeAllStringSchema(appConfig.entries);
}
function configPropertySchema(jsonSchema, key) {
  const properties = jsonSchema.properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return;
  }
  const prop = properties[key];
  if (typeof prop !== "object" || prop === null || Array.isArray(prop)) {
    return;
  }
  return prop;
}
function schemaDefaultForKey(program, key) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const entry = appConfig.entries[key];
  if (!entry) {
    return;
  }
  const jsonSchema = effectiveJsonSchema(program);
  if (jsonSchema) {
    const prop = configPropertySchema(jsonSchema, key);
    if (prop && "default" in prop) {
      return prop.default;
    }
  }
  return entry.default;
}

// ../../src/config/resolve.ts
function isPresent2(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string" && value.length === 0) {
    return false;
  }
  return true;
}
function captureMappedHostEnv(program) {
  const out = {};
  const entries = program.appConfig?.entries;
  if (!entries) {
    return out;
  }
  for (const entry of Object.values(entries)) {
    if (entry.env) {
      out[entry.env] = process.env[entry.env];
    }
  }
  return out;
}
function envOverrideValue(envName, hostEnv) {
  const val = hostEnv && envName in hostEnv ? hostEnv[envName] : process.env[envName];
  if (val === undefined || val.length === 0) {
    return;
  }
  return val;
}
function coerceEnvValue(program, key, raw) {
  const jsonSchema = effectiveJsonSchema(program);
  if (!jsonSchema) {
    return raw;
  }
  const properties = jsonSchema.properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return raw;
  }
  const prop = properties[key];
  if (typeof prop !== "object" || prop === null || Array.isArray(prop)) {
    return raw;
  }
  const type = prop.type;
  if (type === "number" || type === "integer") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (type === "boolean") {
    const lower = raw.toLowerCase();
    if (lower === "true" || lower === "1")
      return true;
    if (lower === "false" || lower === "0")
      return false;
  }
  return raw;
}
function resolveAppConfig(program, fileData, hostEnv) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return {};
  }
  const out = {};
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    const value = resolveConfigKey(program, key, entry, fileData, hostEnv);
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
function tryEnvOverride(program, key, entry, hostEnv) {
  if (!entry.env) {
    return;
  }
  const fromEnv = envOverrideValue(entry.env, hostEnv);
  if (fromEnv === undefined) {
    return;
  }
  return coerceEnvValue(program, key, fromEnv);
}
function buildResolveContext(program, key, entry, fileData, hostEnv) {
  return {
    key,
    entry,
    program,
    fileValue: fileData[key],
    envValue: entry.env ? envOverrideValue(entry.env, hostEnv) : undefined
  };
}
function resolveConfigKey(program, key, entry, fileData, hostEnv) {
  const fromEnv = tryEnvOverride(program, key, entry, hostEnv);
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  if (key in fileData && isPresent2(fileData[key])) {
    return fileData[key];
  }
  if (entry.resolve) {
    const fromResolve = entry.resolve(buildResolveContext(program, key, entry, fileData, hostEnv));
    if (fromResolve != null && typeof fromResolve.then === "function") {
      process.stderr.write(`[argsbarg] config "${key}": resolve() returned a Promise; use a synchronous resolver (e.g. Bun.spawnSync with piped stdout).
`);
    } else if (isPresent2(fromResolve)) {
      return fromResolve;
    }
  }
  const fromEnvFallback = tryEnvOverride(program, key, entry, hostEnv);
  if (fromEnvFallback !== undefined) {
    return fromEnvFallback;
  }
  const def = schemaDefaultForKey(program, key);
  if (def !== undefined) {
    return def;
  }
  return;
}
function exportConfigToEnv(program, resolved, hostEnv) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!entry.env) {
      continue;
    }
    const captured = hostEnv?.[entry.env];
    if (captured !== undefined && captured.length > 0) {
      continue;
    }
    const existing = process.env[entry.env];
    if (existing !== undefined && existing.length > 0) {
      continue;
    }
    const value = resolved[key];
    if (!isPresent2(value)) {
      continue;
    }
    process.env[entry.env] = stringifyConfigValue(value);
  }
}
function stringifyConfigValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
function missingRequiredConfig(program, resolved) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return [];
  }
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const missing = [];
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!configEntryRequired(key, entry, fromSchema)) {
      continue;
    }
    if (!isPresent2(resolved[key])) {
      missing.push(key);
    }
  }
  return missing;
}
function formatMissingConfigMessage(program, keys) {
  const list = keys.join(", ");
  const path = displayAppConfigPath(program);
  return [
    `Missing required configuration: ${list}`,
    `Configure interactively:  ${program.key} configure install`,
    `Or set via:               ${program.key} configure set <key> <value>`,
    `Config file:              ${path}`,
    `See:                      ${program.key} docs mcp`
  ].join(`
`);
}
function formatMcpMissingConfigMessage(program, keys) {
  const list = keys.join(", ");
  const path = displayAppConfigPath(program);
  return [
    `Missing required configuration: ${list}`,
    `Configure: ${program.key} configure`,
    `Or set via: ${program.key} configure set`,
    `Config file: ${path}`
  ].join(`
`);
}

// ../../node_modules/@cfworker/json-schema/dist/esm/deep-compare-strict.js
function deepCompareStrict(a, b) {
  const typeofa = typeof a;
  if (typeofa !== typeof b) {
    return false;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      return false;
    }
    const length = a.length;
    if (length !== b.length) {
      return false;
    }
    for (let i = 0;i < length; i++) {
      if (!deepCompareStrict(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  if (typeofa === "object") {
    if (!a || !b) {
      return a === b;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    const length = aKeys.length;
    if (length !== bKeys.length) {
      return false;
    }
    for (const k of aKeys) {
      if (!deepCompareStrict(a[k], b[k])) {
        return false;
      }
    }
    return true;
  }
  return a === b;
}

// ../../node_modules/@cfworker/json-schema/dist/esm/pointer.js
function encodePointer(p) {
  return encodeURI(escapePointer(p));
}
function escapePointer(p) {
  return p.replace(/~/g, "~0").replace(/\//g, "~1");
}

// ../../node_modules/@cfworker/json-schema/dist/esm/dereference.js
var schemaArrayKeyword = {
  prefixItems: true,
  items: true,
  allOf: true,
  anyOf: true,
  oneOf: true
};
var schemaMapKeyword = {
  $defs: true,
  definitions: true,
  properties: true,
  patternProperties: true,
  dependentSchemas: true
};
var ignoredKeyword = {
  id: true,
  $id: true,
  $ref: true,
  $schema: true,
  $anchor: true,
  $vocabulary: true,
  $comment: true,
  default: true,
  enum: true,
  const: true,
  required: true,
  type: true,
  maximum: true,
  minimum: true,
  exclusiveMaximum: true,
  exclusiveMinimum: true,
  multipleOf: true,
  maxLength: true,
  minLength: true,
  pattern: true,
  format: true,
  maxItems: true,
  minItems: true,
  uniqueItems: true,
  maxProperties: true,
  minProperties: true
};
var initialBaseURI = typeof self !== "undefined" && self.location && self.location.origin !== "null" ? new URL(self.location.origin + self.location.pathname + location.search) : new URL("https://github.com/cfworker");
function dereference(schema, lookup = Object.create(null), baseURI = initialBaseURI, basePointer = "") {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    const id = schema.$id || schema.id;
    if (id) {
      const url = new URL(id, baseURI.href);
      if (url.hash.length > 1) {
        lookup[url.href] = schema;
      } else {
        url.hash = "";
        if (basePointer === "") {
          baseURI = url;
        } else {
          dereference(schema, lookup, baseURI);
        }
      }
    }
  } else if (schema !== true && schema !== false) {
    return lookup;
  }
  const schemaURI = baseURI.href + (basePointer ? "#" + basePointer : "");
  if (lookup[schemaURI] !== undefined) {
    throw new Error(`Duplicate schema URI "${schemaURI}".`);
  }
  lookup[schemaURI] = schema;
  if (schema === true || schema === false) {
    return lookup;
  }
  if (schema.__absolute_uri__ === undefined) {
    Object.defineProperty(schema, "__absolute_uri__", {
      enumerable: false,
      value: schemaURI
    });
  }
  if (schema.$ref && schema.__absolute_ref__ === undefined) {
    const url = new URL(schema.$ref, baseURI.href);
    url.hash = url.hash;
    Object.defineProperty(schema, "__absolute_ref__", {
      enumerable: false,
      value: url.href
    });
  }
  if (schema.$recursiveRef && schema.__absolute_recursive_ref__ === undefined) {
    const url = new URL(schema.$recursiveRef, baseURI.href);
    url.hash = url.hash;
    Object.defineProperty(schema, "__absolute_recursive_ref__", {
      enumerable: false,
      value: url.href
    });
  }
  if (schema.$anchor) {
    const url = new URL("#" + schema.$anchor, baseURI.href);
    lookup[url.href] = schema;
  }
  for (let key in schema) {
    if (ignoredKeyword[key]) {
      continue;
    }
    const keyBase = `${basePointer}/${encodePointer(key)}`;
    const subSchema = schema[key];
    if (Array.isArray(subSchema)) {
      if (schemaArrayKeyword[key]) {
        const length = subSchema.length;
        for (let i = 0;i < length; i++) {
          dereference(subSchema[i], lookup, baseURI, `${keyBase}/${i}`);
        }
      }
    } else if (schemaMapKeyword[key]) {
      for (let subKey in subSchema) {
        dereference(subSchema[subKey], lookup, baseURI, `${keyBase}/${encodePointer(subKey)}`);
      }
    } else {
      dereference(subSchema, lookup, baseURI, keyBase);
    }
  }
  return lookup;
}

// ../../node_modules/@cfworker/json-schema/dist/esm/format.js
var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var TIME = /^(\d\d):(\d\d):(\d\d)(\.\d+)?(z|[+-]\d\d(?::?\d\d)?)?$/i;
var HOSTNAME = /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i;
var URIREF = /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
var URITEMPLATE = /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i;
var URL_ = /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u{00a1}-\u{ffff}0-9]+-?)*[a-z\u{00a1}-\u{ffff}0-9]+)(?:\.(?:[a-z\u{00a1}-\u{ffff}0-9]+-?)*[a-z\u{00a1}-\u{ffff}0-9]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu;
var UUID = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var JSON_POINTER = /^(?:\/(?:[^~/]|~0|~1)*)*$/;
var JSON_POINTER_URI_FRAGMENT = /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i;
var RELATIVE_JSON_POINTER = /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/;
var EMAIL = (input) => {
  if (input[0] === '"')
    return false;
  const [name, host, ...rest] = input.split("@");
  if (!name || !host || rest.length !== 0 || name.length > 64 || host.length > 253)
    return false;
  if (name[0] === "." || name.endsWith(".") || name.includes(".."))
    return false;
  if (!/^[a-z0-9.-]+$/i.test(host) || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(name))
    return false;
  return host.split(".").every((part) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(part));
};
var IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
var IPV6 = /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i;
var DURATION = (input) => input.length > 1 && input.length < 80 && (/^P\d+([.,]\d+)?W$/.test(input) || /^P[\dYMDTHS]*(\d[.,]\d+)?[YMDHS]$/.test(input) && /^P([.,\d]+Y)?([.,\d]+M)?([.,\d]+D)?(T([.,\d]+H)?([.,\d]+M)?([.,\d]+S)?)?$/.test(input));
function bind(r) {
  return r.test.bind(r);
}
var format = {
  date,
  time: time.bind(undefined, false),
  "date-time": date_time,
  duration: DURATION,
  uri,
  "uri-reference": bind(URIREF),
  "uri-template": bind(URITEMPLATE),
  url: bind(URL_),
  email: EMAIL,
  hostname: bind(HOSTNAME),
  ipv4: bind(IPV4),
  ipv6: bind(IPV6),
  regex,
  uuid: bind(UUID),
  "json-pointer": bind(JSON_POINTER),
  "json-pointer-uri-fragment": bind(JSON_POINTER_URI_FRAGMENT),
  "relative-json-pointer": bind(RELATIVE_JSON_POINTER)
};
function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function date(str) {
  const matches = str.match(DATE);
  if (!matches)
    return false;
  const year = +matches[1];
  const month = +matches[2];
  const day = +matches[3];
  return month >= 1 && month <= 12 && day >= 1 && day <= (month == 2 && isLeapYear(year) ? 29 : DAYS[month]);
}
function time(full, str) {
  const matches = str.match(TIME);
  if (!matches)
    return false;
  const hour = +matches[1];
  const minute = +matches[2];
  const second = +matches[3];
  const timeZone = !!matches[5];
  return (hour <= 23 && minute <= 59 && second <= 59 || hour == 23 && minute == 59 && second == 60) && (!full || timeZone);
}
var DATE_TIME_SEPARATOR = /t|\s/i;
function date_time(str) {
  const dateTime = str.split(DATE_TIME_SEPARATOR);
  return dateTime.length == 2 && date(dateTime[0]) && time(true, dateTime[1]);
}
var NOT_URI_FRAGMENT = /\/|:/;
var URI_PATTERN = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
function uri(str) {
  return NOT_URI_FRAGMENT.test(str) && URI_PATTERN.test(str);
}
var Z_ANCHOR = /[^\\]\\Z/;
function regex(str) {
  if (Z_ANCHOR.test(str))
    return false;
  try {
    new RegExp(str, "u");
    return true;
  } catch (e) {
    return false;
  }
}

// ../../node_modules/@cfworker/json-schema/dist/esm/ucs2-length.js
function ucs2length(s) {
  let result = 0;
  let length = s.length;
  let index = 0;
  let charCode;
  while (index < length) {
    result++;
    charCode = s.charCodeAt(index++);
    if (charCode >= 55296 && charCode <= 56319 && index < length) {
      charCode = s.charCodeAt(index);
      if ((charCode & 64512) == 56320) {
        index++;
      }
    }
  }
  return result;
}

// ../../node_modules/@cfworker/json-schema/dist/esm/validate.js
function validate(instance, schema, draft = "2019-09", lookup = dereference(schema), shortCircuit = true, recursiveAnchor = null, instanceLocation = "#", schemaLocation = "#", evaluated = Object.create(null)) {
  if (schema === true) {
    return { valid: true, errors: [] };
  }
  if (schema === false) {
    return {
      valid: false,
      errors: [
        {
          instanceLocation,
          keyword: "false",
          keywordLocation: instanceLocation,
          error: "False boolean schema."
        }
      ]
    };
  }
  const rawInstanceType = typeof instance;
  let instanceType;
  switch (rawInstanceType) {
    case "boolean":
    case "number":
    case "string":
      instanceType = rawInstanceType;
      break;
    case "object":
      if (instance === null) {
        instanceType = "null";
      } else if (Array.isArray(instance)) {
        instanceType = "array";
      } else {
        instanceType = "object";
      }
      break;
    default:
      throw new Error(`Instances of "${rawInstanceType}" type are not supported.`);
  }
  const { $ref, $recursiveRef, $recursiveAnchor, type: $type, const: $const, enum: $enum, required: $required, not: $not, anyOf: $anyOf, allOf: $allOf, oneOf: $oneOf, if: $if, then: $then, else: $else, format: $format, properties: $properties, patternProperties: $patternProperties, additionalProperties: $additionalProperties, unevaluatedProperties: $unevaluatedProperties, minProperties: $minProperties, maxProperties: $maxProperties, propertyNames: $propertyNames, dependentRequired: $dependentRequired, dependentSchemas: $dependentSchemas, dependencies: $dependencies, prefixItems: $prefixItems, items: $items, additionalItems: $additionalItems, unevaluatedItems: $unevaluatedItems, contains: $contains, minContains: $minContains, maxContains: $maxContains, minItems: $minItems, maxItems: $maxItems, uniqueItems: $uniqueItems, minimum: $minimum, maximum: $maximum, exclusiveMinimum: $exclusiveMinimum, exclusiveMaximum: $exclusiveMaximum, multipleOf: $multipleOf, minLength: $minLength, maxLength: $maxLength, pattern: $pattern, __absolute_ref__, __absolute_recursive_ref__ } = schema;
  const errors = [];
  if ($recursiveAnchor === true && recursiveAnchor === null) {
    recursiveAnchor = schema;
  }
  if ($recursiveRef === "#") {
    const refSchema = recursiveAnchor === null ? lookup[__absolute_recursive_ref__] : recursiveAnchor;
    const keywordLocation = `${schemaLocation}/$recursiveRef`;
    const result = validate(instance, recursiveAnchor === null ? schema : recursiveAnchor, draft, lookup, shortCircuit, refSchema, instanceLocation, keywordLocation, evaluated);
    if (!result.valid) {
      errors.push({
        instanceLocation,
        keyword: "$recursiveRef",
        keywordLocation,
        error: "A subschema had errors."
      }, ...result.errors);
    }
  }
  if ($ref !== undefined) {
    const uri2 = __absolute_ref__ || $ref;
    const refSchema = lookup[uri2];
    if (refSchema === undefined) {
      let message = `Unresolved $ref "${$ref}".`;
      if (__absolute_ref__ && __absolute_ref__ !== $ref) {
        message += `  Absolute URI "${__absolute_ref__}".`;
      }
      message += `
Known schemas:
- ${Object.keys(lookup).join(`
- `)}`;
      throw new Error(message);
    }
    const keywordLocation = `${schemaLocation}/$ref`;
    const result = validate(instance, refSchema, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation, evaluated);
    if (!result.valid) {
      errors.push({
        instanceLocation,
        keyword: "$ref",
        keywordLocation,
        error: "A subschema had errors."
      }, ...result.errors);
    }
    if (draft === "4" || draft === "7") {
      return { valid: errors.length === 0, errors };
    }
  }
  if (Array.isArray($type)) {
    let length = $type.length;
    let valid = false;
    for (let i = 0;i < length; i++) {
      if (instanceType === $type[i] || $type[i] === "integer" && instanceType === "number" && instance % 1 === 0 && instance === instance) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      errors.push({
        instanceLocation,
        keyword: "type",
        keywordLocation: `${schemaLocation}/type`,
        error: `Instance type "${instanceType}" is invalid. Expected "${$type.join('", "')}".`
      });
    }
  } else if ($type === "integer") {
    if (instanceType !== "number" || instance % 1 || instance !== instance) {
      errors.push({
        instanceLocation,
        keyword: "type",
        keywordLocation: `${schemaLocation}/type`,
        error: `Instance type "${instanceType}" is invalid. Expected "${$type}".`
      });
    }
  } else if ($type !== undefined && instanceType !== $type) {
    errors.push({
      instanceLocation,
      keyword: "type",
      keywordLocation: `${schemaLocation}/type`,
      error: `Instance type "${instanceType}" is invalid. Expected "${$type}".`
    });
  }
  if ($const !== undefined) {
    if (instanceType === "object" || instanceType === "array") {
      if (!deepCompareStrict(instance, $const)) {
        errors.push({
          instanceLocation,
          keyword: "const",
          keywordLocation: `${schemaLocation}/const`,
          error: `Instance does not match ${JSON.stringify($const)}.`
        });
      }
    } else if (instance !== $const) {
      errors.push({
        instanceLocation,
        keyword: "const",
        keywordLocation: `${schemaLocation}/const`,
        error: `Instance does not match ${JSON.stringify($const)}.`
      });
    }
  }
  if ($enum !== undefined) {
    if (instanceType === "object" || instanceType === "array") {
      if (!$enum.some((value) => deepCompareStrict(instance, value))) {
        errors.push({
          instanceLocation,
          keyword: "enum",
          keywordLocation: `${schemaLocation}/enum`,
          error: `Instance does not match any of ${JSON.stringify($enum)}.`
        });
      }
    } else if (!$enum.some((value) => instance === value)) {
      errors.push({
        instanceLocation,
        keyword: "enum",
        keywordLocation: `${schemaLocation}/enum`,
        error: `Instance does not match any of ${JSON.stringify($enum)}.`
      });
    }
  }
  if ($not !== undefined) {
    const keywordLocation = `${schemaLocation}/not`;
    const result = validate(instance, $not, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation);
    if (result.valid) {
      errors.push({
        instanceLocation,
        keyword: "not",
        keywordLocation,
        error: 'Instance matched "not" schema.'
      });
    }
  }
  let subEvaluateds = [];
  if ($anyOf !== undefined) {
    const keywordLocation = `${schemaLocation}/anyOf`;
    const errorsLength = errors.length;
    let anyValid = false;
    for (let i = 0;i < $anyOf.length; i++) {
      const subSchema = $anyOf[i];
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      anyValid = anyValid || result.valid;
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
    }
    if (anyValid) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "anyOf",
        keywordLocation,
        error: "Instance does not match any subschemas."
      });
    }
  }
  if ($allOf !== undefined) {
    const keywordLocation = `${schemaLocation}/allOf`;
    const errorsLength = errors.length;
    let allValid = true;
    for (let i = 0;i < $allOf.length; i++) {
      const subSchema = $allOf[i];
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      allValid = allValid && result.valid;
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
    }
    if (allValid) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "allOf",
        keywordLocation,
        error: `Instance does not match every subschema.`
      });
    }
  }
  if ($oneOf !== undefined) {
    const keywordLocation = `${schemaLocation}/oneOf`;
    const errorsLength = errors.length;
    const matches = $oneOf.filter((subSchema, i) => {
      const subEvaluated = Object.create(evaluated);
      const result = validate(instance, subSchema, draft, lookup, shortCircuit, $recursiveAnchor === true ? recursiveAnchor : null, instanceLocation, `${keywordLocation}/${i}`, subEvaluated);
      errors.push(...result.errors);
      if (result.valid) {
        subEvaluateds.push(subEvaluated);
      }
      return result.valid;
    }).length;
    if (matches === 1) {
      errors.length = errorsLength;
    } else {
      errors.splice(errorsLength, 0, {
        instanceLocation,
        keyword: "oneOf",
        keywordLocation,
        error: `Instance does not match exactly one subschema (${matches} matches).`
      });
    }
  }
  if (instanceType === "object" || instanceType === "array") {
    Object.assign(evaluated, ...subEvaluateds);
  }
  if ($if !== undefined) {
    const keywordLocation = `${schemaLocation}/if`;
    const conditionResult = validate(instance, $if, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, keywordLocation, evaluated).valid;
    if (conditionResult) {
      if ($then !== undefined) {
        const thenResult = validate(instance, $then, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${schemaLocation}/then`, evaluated);
        if (!thenResult.valid) {
          errors.push({
            instanceLocation,
            keyword: "if",
            keywordLocation,
            error: `Instance does not match "then" schema.`
          }, ...thenResult.errors);
        }
      }
    } else if ($else !== undefined) {
      const elseResult = validate(instance, $else, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${schemaLocation}/else`, evaluated);
      if (!elseResult.valid) {
        errors.push({
          instanceLocation,
          keyword: "if",
          keywordLocation,
          error: `Instance does not match "else" schema.`
        }, ...elseResult.errors);
      }
    }
  }
  if (instanceType === "object") {
    if ($required !== undefined) {
      for (const key of $required) {
        if (!(key in instance)) {
          errors.push({
            instanceLocation,
            keyword: "required",
            keywordLocation: `${schemaLocation}/required`,
            error: `Instance does not have required property "${key}".`
          });
        }
      }
    }
    const keys = Object.keys(instance);
    if ($minProperties !== undefined && keys.length < $minProperties) {
      errors.push({
        instanceLocation,
        keyword: "minProperties",
        keywordLocation: `${schemaLocation}/minProperties`,
        error: `Instance does not have at least ${$minProperties} properties.`
      });
    }
    if ($maxProperties !== undefined && keys.length > $maxProperties) {
      errors.push({
        instanceLocation,
        keyword: "maxProperties",
        keywordLocation: `${schemaLocation}/maxProperties`,
        error: `Instance does not have at least ${$maxProperties} properties.`
      });
    }
    if ($propertyNames !== undefined) {
      const keywordLocation = `${schemaLocation}/propertyNames`;
      for (const key in instance) {
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(key, $propertyNames, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
        if (!result.valid) {
          errors.push({
            instanceLocation,
            keyword: "propertyNames",
            keywordLocation,
            error: `Property name "${key}" does not match schema.`
          }, ...result.errors);
        }
      }
    }
    if ($dependentRequired !== undefined) {
      const keywordLocation = `${schemaLocation}/dependantRequired`;
      for (const key in $dependentRequired) {
        if (key in instance) {
          const required = $dependentRequired[key];
          for (const dependantKey of required) {
            if (!(dependantKey in instance)) {
              errors.push({
                instanceLocation,
                keyword: "dependentRequired",
                keywordLocation,
                error: `Instance has "${key}" but does not have "${dependantKey}".`
              });
            }
          }
        }
      }
    }
    if ($dependentSchemas !== undefined) {
      for (const key in $dependentSchemas) {
        const keywordLocation = `${schemaLocation}/dependentSchemas`;
        if (key in instance) {
          const result = validate(instance, $dependentSchemas[key], draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${keywordLocation}/${encodePointer(key)}`, evaluated);
          if (!result.valid) {
            errors.push({
              instanceLocation,
              keyword: "dependentSchemas",
              keywordLocation,
              error: `Instance has "${key}" but does not match dependant schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if ($dependencies !== undefined) {
      const keywordLocation = `${schemaLocation}/dependencies`;
      for (const key in $dependencies) {
        if (key in instance) {
          const propsOrSchema = $dependencies[key];
          if (Array.isArray(propsOrSchema)) {
            for (const dependantKey of propsOrSchema) {
              if (!(dependantKey in instance)) {
                errors.push({
                  instanceLocation,
                  keyword: "dependencies",
                  keywordLocation,
                  error: `Instance has "${key}" but does not have "${dependantKey}".`
                });
              }
            }
          } else {
            const result = validate(instance, propsOrSchema, draft, lookup, shortCircuit, recursiveAnchor, instanceLocation, `${keywordLocation}/${encodePointer(key)}`);
            if (!result.valid) {
              errors.push({
                instanceLocation,
                keyword: "dependencies",
                keywordLocation,
                error: `Instance has "${key}" but does not match dependant schema.`
              }, ...result.errors);
            }
          }
        }
      }
    }
    const thisEvaluated = Object.create(null);
    let stop = false;
    if ($properties !== undefined) {
      const keywordLocation = `${schemaLocation}/properties`;
      for (const key in $properties) {
        if (!(key in instance)) {
          continue;
        }
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(instance[key], $properties[key], draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, `${keywordLocation}/${encodePointer(key)}`);
        if (result.valid) {
          evaluated[key] = thisEvaluated[key] = true;
        } else {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "properties",
            keywordLocation,
            error: `Property "${key}" does not match schema.`
          }, ...result.errors);
          if (stop)
            break;
        }
      }
    }
    if (!stop && $patternProperties !== undefined) {
      const keywordLocation = `${schemaLocation}/patternProperties`;
      for (const pattern in $patternProperties) {
        const regex2 = new RegExp(pattern, "u");
        const subSchema = $patternProperties[pattern];
        for (const key in instance) {
          if (!regex2.test(key)) {
            continue;
          }
          const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
          const result = validate(instance[key], subSchema, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, `${keywordLocation}/${encodePointer(pattern)}`);
          if (result.valid) {
            evaluated[key] = thisEvaluated[key] = true;
          } else {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "patternProperties",
              keywordLocation,
              error: `Property "${key}" matches pattern "${pattern}" but does not match associated schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if (!stop && $additionalProperties !== undefined) {
      const keywordLocation = `${schemaLocation}/additionalProperties`;
      for (const key in instance) {
        if (thisEvaluated[key]) {
          continue;
        }
        const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
        const result = validate(instance[key], $additionalProperties, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
        if (result.valid) {
          evaluated[key] = true;
        } else {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "additionalProperties",
            keywordLocation,
            error: `Property "${key}" does not match additional properties schema.`
          }, ...result.errors);
        }
      }
    } else if (!stop && $unevaluatedProperties !== undefined) {
      const keywordLocation = `${schemaLocation}/unevaluatedProperties`;
      for (const key in instance) {
        if (!evaluated[key]) {
          const subInstancePointer = `${instanceLocation}/${encodePointer(key)}`;
          const result = validate(instance[key], $unevaluatedProperties, draft, lookup, shortCircuit, recursiveAnchor, subInstancePointer, keywordLocation);
          if (result.valid) {
            evaluated[key] = true;
          } else {
            errors.push({
              instanceLocation,
              keyword: "unevaluatedProperties",
              keywordLocation,
              error: `Property "${key}" does not match unevaluated properties schema.`
            }, ...result.errors);
          }
        }
      }
    }
  } else if (instanceType === "array") {
    if ($maxItems !== undefined && instance.length > $maxItems) {
      errors.push({
        instanceLocation,
        keyword: "maxItems",
        keywordLocation: `${schemaLocation}/maxItems`,
        error: `Array has too many items (${instance.length} > ${$maxItems}).`
      });
    }
    if ($minItems !== undefined && instance.length < $minItems) {
      errors.push({
        instanceLocation,
        keyword: "minItems",
        keywordLocation: `${schemaLocation}/minItems`,
        error: `Array has too few items (${instance.length} < ${$minItems}).`
      });
    }
    const length = instance.length;
    let i = 0;
    let stop = false;
    if ($prefixItems !== undefined) {
      const keywordLocation = `${schemaLocation}/prefixItems`;
      const length2 = Math.min($prefixItems.length, length);
      for (;i < length2; i++) {
        const result = validate(instance[i], $prefixItems[i], draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, `${keywordLocation}/${i}`);
        evaluated[i] = true;
        if (!result.valid) {
          stop = shortCircuit;
          errors.push({
            instanceLocation,
            keyword: "prefixItems",
            keywordLocation,
            error: `Items did not match schema.`
          }, ...result.errors);
          if (stop)
            break;
        }
      }
    }
    if ($items !== undefined) {
      const keywordLocation = `${schemaLocation}/items`;
      if (Array.isArray($items)) {
        const length2 = Math.min($items.length, length);
        for (;i < length2; i++) {
          const result = validate(instance[i], $items[i], draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, `${keywordLocation}/${i}`);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "items",
              keywordLocation,
              error: `Items did not match schema.`
            }, ...result.errors);
            if (stop)
              break;
          }
        }
      } else {
        for (;i < length; i++) {
          const result = validate(instance[i], $items, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "items",
              keywordLocation,
              error: `Items did not match schema.`
            }, ...result.errors);
            if (stop)
              break;
          }
        }
      }
      if (!stop && $additionalItems !== undefined) {
        const keywordLocation2 = `${schemaLocation}/additionalItems`;
        for (;i < length; i++) {
          const result = validate(instance[i], $additionalItems, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation2);
          evaluated[i] = true;
          if (!result.valid) {
            stop = shortCircuit;
            errors.push({
              instanceLocation,
              keyword: "additionalItems",
              keywordLocation: keywordLocation2,
              error: `Items did not match additional items schema.`
            }, ...result.errors);
          }
        }
      }
    }
    if ($contains !== undefined) {
      if (length === 0 && $minContains === undefined) {
        errors.push({
          instanceLocation,
          keyword: "contains",
          keywordLocation: `${schemaLocation}/contains`,
          error: `Array is empty. It must contain at least one item matching the schema.`
        });
      } else if ($minContains !== undefined && length < $minContains) {
        errors.push({
          instanceLocation,
          keyword: "minContains",
          keywordLocation: `${schemaLocation}/minContains`,
          error: `Array has less items (${length}) than minContains (${$minContains}).`
        });
      } else {
        const keywordLocation = `${schemaLocation}/contains`;
        const errorsLength = errors.length;
        let contained = 0;
        for (let j = 0;j < length; j++) {
          const result = validate(instance[j], $contains, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${j}`, keywordLocation);
          if (result.valid) {
            evaluated[j] = true;
            contained++;
          } else {
            errors.push(...result.errors);
          }
        }
        if (contained >= ($minContains || 0)) {
          errors.length = errorsLength;
        }
        if ($minContains === undefined && $maxContains === undefined && contained === 0) {
          errors.splice(errorsLength, 0, {
            instanceLocation,
            keyword: "contains",
            keywordLocation,
            error: `Array does not contain item matching schema.`
          });
        } else if ($minContains !== undefined && contained < $minContains) {
          errors.push({
            instanceLocation,
            keyword: "minContains",
            keywordLocation: `${schemaLocation}/minContains`,
            error: `Array must contain at least ${$minContains} items matching schema. Only ${contained} items were found.`
          });
        } else if ($maxContains !== undefined && contained > $maxContains) {
          errors.push({
            instanceLocation,
            keyword: "maxContains",
            keywordLocation: `${schemaLocation}/maxContains`,
            error: `Array may contain at most ${$maxContains} items matching schema. ${contained} items were found.`
          });
        }
      }
    }
    if (!stop && $unevaluatedItems !== undefined) {
      const keywordLocation = `${schemaLocation}/unevaluatedItems`;
      for (i;i < length; i++) {
        if (evaluated[i]) {
          continue;
        }
        const result = validate(instance[i], $unevaluatedItems, draft, lookup, shortCircuit, recursiveAnchor, `${instanceLocation}/${i}`, keywordLocation);
        evaluated[i] = true;
        if (!result.valid) {
          errors.push({
            instanceLocation,
            keyword: "unevaluatedItems",
            keywordLocation,
            error: `Items did not match unevaluated items schema.`
          }, ...result.errors);
        }
      }
    }
    if ($uniqueItems) {
      for (let j = 0;j < length; j++) {
        const a = instance[j];
        const ao = typeof a === "object" && a !== null;
        for (let k = 0;k < length; k++) {
          if (j === k) {
            continue;
          }
          const b = instance[k];
          const bo = typeof b === "object" && b !== null;
          if (a === b || ao && bo && deepCompareStrict(a, b)) {
            errors.push({
              instanceLocation,
              keyword: "uniqueItems",
              keywordLocation: `${schemaLocation}/uniqueItems`,
              error: `Duplicate items at indexes ${j} and ${k}.`
            });
            j = Number.MAX_SAFE_INTEGER;
            k = Number.MAX_SAFE_INTEGER;
          }
        }
      }
    }
  } else if (instanceType === "number") {
    if (draft === "4") {
      if ($minimum !== undefined && ($exclusiveMinimum === true && instance <= $minimum || instance < $minimum)) {
        errors.push({
          instanceLocation,
          keyword: "minimum",
          keywordLocation: `${schemaLocation}/minimum`,
          error: `${instance} is less than ${$exclusiveMinimum ? "or equal to " : ""} ${$minimum}.`
        });
      }
      if ($maximum !== undefined && ($exclusiveMaximum === true && instance >= $maximum || instance > $maximum)) {
        errors.push({
          instanceLocation,
          keyword: "maximum",
          keywordLocation: `${schemaLocation}/maximum`,
          error: `${instance} is greater than ${$exclusiveMaximum ? "or equal to " : ""} ${$maximum}.`
        });
      }
    } else {
      if ($minimum !== undefined && instance < $minimum) {
        errors.push({
          instanceLocation,
          keyword: "minimum",
          keywordLocation: `${schemaLocation}/minimum`,
          error: `${instance} is less than ${$minimum}.`
        });
      }
      if ($maximum !== undefined && instance > $maximum) {
        errors.push({
          instanceLocation,
          keyword: "maximum",
          keywordLocation: `${schemaLocation}/maximum`,
          error: `${instance} is greater than ${$maximum}.`
        });
      }
      if ($exclusiveMinimum !== undefined && instance <= $exclusiveMinimum) {
        errors.push({
          instanceLocation,
          keyword: "exclusiveMinimum",
          keywordLocation: `${schemaLocation}/exclusiveMinimum`,
          error: `${instance} is less than ${$exclusiveMinimum}.`
        });
      }
      if ($exclusiveMaximum !== undefined && instance >= $exclusiveMaximum) {
        errors.push({
          instanceLocation,
          keyword: "exclusiveMaximum",
          keywordLocation: `${schemaLocation}/exclusiveMaximum`,
          error: `${instance} is greater than or equal to ${$exclusiveMaximum}.`
        });
      }
    }
    if ($multipleOf !== undefined) {
      const remainder = instance % $multipleOf;
      if (Math.abs(0 - remainder) >= 0.00000011920929 && Math.abs($multipleOf - remainder) >= 0.00000011920929) {
        errors.push({
          instanceLocation,
          keyword: "multipleOf",
          keywordLocation: `${schemaLocation}/multipleOf`,
          error: `${instance} is not a multiple of ${$multipleOf}.`
        });
      }
    }
  } else if (instanceType === "string") {
    const length = $minLength === undefined && $maxLength === undefined ? 0 : ucs2length(instance);
    if ($minLength !== undefined && length < $minLength) {
      errors.push({
        instanceLocation,
        keyword: "minLength",
        keywordLocation: `${schemaLocation}/minLength`,
        error: `String is too short (${length} < ${$minLength}).`
      });
    }
    if ($maxLength !== undefined && length > $maxLength) {
      errors.push({
        instanceLocation,
        keyword: "maxLength",
        keywordLocation: `${schemaLocation}/maxLength`,
        error: `String is too long (${length} > ${$maxLength}).`
      });
    }
    if ($pattern !== undefined && !new RegExp($pattern, "u").test(instance)) {
      errors.push({
        instanceLocation,
        keyword: "pattern",
        keywordLocation: `${schemaLocation}/pattern`,
        error: `String does not match pattern.`
      });
    }
    if ($format !== undefined && format[$format] && !format[$format](instance)) {
      errors.push({
        instanceLocation,
        keyword: "format",
        keywordLocation: `${schemaLocation}/format`,
        error: `String does not match format "${$format}".`
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

// ../../node_modules/@cfworker/json-schema/dist/esm/validator.js
class Validator {
  schema;
  draft;
  shortCircuit;
  lookup;
  constructor(schema, draft = "2019-09", shortCircuit = true) {
    this.schema = schema;
    this.draft = draft;
    this.shortCircuit = shortCircuit;
    this.lookup = dereference(schema);
  }
  validate(instance) {
    return validate(instance, this.schema, this.draft, this.lookup, this.shortCircuit);
  }
  addSchema(schema, id) {
    if (id) {
      schema = { ...schema, $id: id };
    }
    dereference(schema, this.lookup);
  }
}

// ../../src/core/formats.ts
var DURATION_RE = /^\d+[hdms]?$/i;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseDurationMs(durationStr) {
  const match = durationStr.trim().match(/^(\d+)([hdms]?)$/i);
  if (!match) {
    throw new Error("Invalid duration format. Use e.g. 30s, 20m, 1h, 2d");
  }
  const amountText = match[1];
  if (!amountText) {
    throw new Error("Invalid duration format. Use e.g. 30s, 20m, 1h, 2d");
  }
  const amount = Number.parseInt(amountText, 10);
  const unit = (match[2] || "m").toLowerCase();
  if (unit === "s")
    return amount * 1000;
  if (unit === "m")
    return amount * 60 * 1000;
  if (unit === "h")
    return amount * 60 * 60 * 1000;
  if (unit === "d")
    return amount * 24 * 60 * 60 * 1000;
  return amount * 60 * 1000;
}
function validateDuration(s) {
  if (!DURATION_RE.test(s.trim())) {
    throw new Error("Invalid duration format. Use e.g. 30s, 20m, 1h, 2d");
  }
  parseDurationMs(s);
}
function parseCommaList(s) {
  return s.split(",").map((part) => part.trim()).filter(Boolean);
}
function validateCommaList(s) {
  if (parseCommaList(s).length === 0) {
    throw new Error("Comma-separated list must contain at least one value");
  }
}
function parseDate(s) {
  const trimmed = s.trim();
  if (!DATE_RE.test(trimmed)) {
    throw new Error("Invalid date. Use YYYY-MM-DD");
  }
  const [y, m, d] = trimmed.split("-").map((part) => Number.parseInt(part, 10));
  const year = y ?? 0;
  const month = m ?? 0;
  const day = d ?? 0;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    throw new Error("Invalid date. Use YYYY-MM-DD");
  }
  return trimmed;
}
function validateDate(s) {
  parseDate(s);
}
var DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
function parseDateTime(s) {
  const trimmed = s.trim();
  if (!DATE_TIME_RE.test(trimmed)) {
    throw new Error("Invalid date-time. Use RFC 3339, e.g. 2026-06-22T15:00:00Z");
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new Error("Invalid date-time. Use RFC 3339, e.g. 2026-06-22T15:00:00Z");
  }
  return new Date(ms).toISOString();
}
function validateDateTime(s) {
  parseDateTime(s);
}
function validatePattern(s, pattern) {
  const re = new RegExp(pattern);
  if (!re.test(s)) {
    throw new Error(`Value does not match required pattern: ${pattern}`);
  }
}
function formatValidationError(format2, value) {
  switch (format2) {
    case "duration" /* Duration */:
      return `Invalid duration: ${value} (use e.g. 30s, 20m, 1h, 2d)`;
    case "comma-list" /* CommaList */:
      return `Invalid comma-separated list: ${value}`;
    case "date" /* Date */:
      return `Invalid date: ${value} (use YYYY-MM-DD)`;
    case "date-time" /* DateTime */:
      return `Invalid date-time: ${value} (use RFC 3339, e.g. 2026-06-22T15:00:00Z)`;
  }
}
function validateFormatValue(value, format2, pattern) {
  if (format2 !== undefined) {
    switch (format2) {
      case "duration" /* Duration */:
        validateDuration(value);
        return;
      case "comma-list" /* CommaList */:
        validateCommaList(value);
        return;
      case "date" /* Date */:
        validateDate(value);
        return;
      case "date-time" /* DateTime */:
        validateDateTime(value);
        return;
    }
  }
  if (pattern !== undefined) {
    validatePattern(value, pattern);
  }
}

// ../../src/config/validate.ts
if (!format["comma-list"]) {
  format["comma-list"] = (value) => {
    try {
      validateCommaList(value);
      return true;
    } catch {
      return false;
    }
  };
}
function dataForSchemaValidation(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return data;
  }
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (isFrameworkConfigKey(key)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}
function schemaWithoutRequired(schema) {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map(schemaWithoutRequired);
  }
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "required") {
      continue;
    }
    out[key] = schemaWithoutRequired(value);
  }
  return out;
}
function formatInstancePath(instanceLocation) {
  if (instanceLocation.length === 0 || instanceLocation === "#") {
    return "$";
  }
  if (instanceLocation.startsWith("#/")) {
    return instanceLocation.slice(2).replace(/\//g, ".");
  }
  return instanceLocation;
}
function formatValidationErrors(errors) {
  return errors.map(({ instanceLocation, error }) => {
    const path = formatInstancePath(instanceLocation);
    return `${path}: ${error}`;
  });
}
function decodeJsonPointerSegment2(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}
function resolveSchemaDraft(schema) {
  const $schema = schema.$schema;
  if (typeof $schema !== "string") {
    return "7";
  }
  const normalized = $schema.toLowerCase();
  if (normalized.includes("2020-12")) {
    return "2020-12";
  }
  if (normalized.includes("2019-09")) {
    return "2019-09";
  }
  if (normalized.includes("draft-04") || normalized.includes("draft/4")) {
    return "4";
  }
  if (normalized.includes("draft-07") || normalized.includes("draft/7")) {
    return "7";
  }
  return "7";
}
function resolveJsonPointer2(root, ref) {
  if (!ref.startsWith("#/")) {
    return;
  }
  const segments = ref.slice(2).split("/").filter((segment) => segment.length > 0).map(decodeJsonPointerSegment2);
  let current = root;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return;
    }
    current = current[segment];
  }
  return current;
}
function attachRootCompanionSchemas(validator, root, active) {
  if (active === root) {
    return;
  }
  const companion = {};
  if (typeof root.definitions === "object" && root.definitions !== null && !Array.isArray(root.definitions) && Object.keys(root.definitions).length > 0) {
    companion.definitions = root.definitions;
  }
  if (typeof root.$defs === "object" && root.$defs !== null && !Array.isArray(root.$defs) && Object.keys(root.$defs).length > 0) {
    companion.$defs = root.$defs;
  }
  if (Object.keys(companion).length > 0) {
    validator.addSchema(companion);
  }
}
function validatorForSchema(schema, root, partial) {
  const active = partial ? schemaWithoutRequired(schema) : schema;
  const validator = new Validator(active, resolveSchemaDraft(root), false);
  attachRootCompanionSchemas(validator, root, active);
  return validator;
}
function validateInstance(data, schema, root, partial, stripFrameworkKeys) {
  const validator = validatorForSchema(schema, root, partial);
  const payload = stripFrameworkKeys ? dataForSchemaValidation(data) : data;
  const result = validator.validate(payload);
  if (result.valid) {
    return { valid: true, errors: [] };
  }
  return { valid: false, errors: formatValidationErrors(result.errors) };
}
function validateAgainstSchema(data, rootSchema, partial) {
  return validateInstance(data, rootSchema, rootSchema, partial, true);
}
function validateConfigDocument(data, rootSchema) {
  return validateAgainstSchema(data, rootSchema, false);
}
function validateConfigDocumentPartial(data, rootSchema) {
  return validateAgainstSchema(data, rootSchema, true);
}
function resolveSchema(schema, root) {
  const ref = schema.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    return schema;
  }
  const target = resolveJsonPointer2(root, ref);
  if (typeof target === "object" && target !== null && !Array.isArray(target)) {
    return target;
  }
  return schema;
}
function normalizeTypes(type) {
  if (typeof type === "string") {
    return [type];
  }
  if (Array.isArray(type)) {
    return type.filter((t) => typeof t === "string");
  }
  return [];
}
function validateParsedConfigValue(parsed, propertySchema, rootSchema) {
  if (!propertySchema) {
    return parsed;
  }
  const result = validateInstance(parsed, propertySchema, rootSchema, false, false);
  if (!result.valid) {
    throw new Error(result.errors[0] ?? "Invalid config value");
  }
  return parsed;
}
function parseJsonLiteral(raw, propertySchema, rootSchema) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }
  return validateParsedConfigValue(parsed, propertySchema, rootSchema);
}
function homogeneousPrimitiveArrayItems(arraySchema, rootSchema) {
  const items = arraySchema.items;
  if (typeof items !== "object" || items === null || Array.isArray(items)) {
    return;
  }
  const resolved = resolveSchema(items, rootSchema);
  if (!resolved) {
    return;
  }
  const types = normalizeTypes(resolved.type);
  if (types.length !== 1) {
    return;
  }
  const kind = types[0];
  if (kind === "string" || kind === "integer" || kind === "number" || kind === "boolean") {
    const format2 = typeof resolved.format === "string" ? resolved.format : undefined;
    return { kind, format: format2 };
  }
  return;
}
function parseBooleanToken(raw) {
  const lower = raw.trim().toLowerCase();
  if (lower === "true" || lower === "1")
    return true;
  if (lower === "false" || lower === "0")
    return false;
  throw new Error("Expected boolean: true, false, 1, or 0");
}
function parsePrimitiveArraySegment(segment, items) {
  switch (items.kind) {
    case "string": {
      if (items.format === "date") {
        return parseDate(segment);
      }
      if (items.format === "date-time") {
        return parseDateTime(segment);
      }
      return segment;
    }
    case "integer": {
      const n = Number(segment);
      if (Number.isNaN(n) || !Number.isInteger(n)) {
        throw new Error(`Expected integer: ${segment}`);
      }
      return n;
    }
    case "number": {
      const n = Number(segment);
      if (Number.isNaN(n)) {
        throw new Error(`Expected number: ${segment}`);
      }
      return n;
    }
    case "boolean":
      return parseBooleanToken(segment);
  }
}
function parseHomogeneousPrimitiveArray(raw, arraySchema, rootSchema) {
  const items = homogeneousPrimitiveArrayItems(arraySchema, rootSchema);
  if (!items) {
    throw new Error("Use --json for object or array config values");
  }
  const segments = parseCommaList(raw);
  if (segments.length === 0) {
    throw new Error("Comma-separated list must contain at least one value");
  }
  return segments.map((segment) => parsePrimitiveArraySegment(segment, items));
}
function configValueInputHint(propertySchema, rootSchema) {
  if (!propertySchema) {
    return;
  }
  const resolved = resolveSchema(propertySchema, rootSchema);
  if (!resolved) {
    return;
  }
  const types = normalizeTypes(resolved.type);
  if (types.includes("array") && homogeneousPrimitiveArrayItems(resolved, rootSchema)) {
    return "comma-separated or JSON array";
  }
  if (types.includes("array") || types.includes("object")) {
    return "JSON";
  }
  return;
}
function parseConfigSetValue(raw, propertySchema, rootSchema, useJson) {
  if (useJson) {
    return parseJsonLiteral(raw, propertySchema, rootSchema);
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJsonLiteral(trimmed, propertySchema, rootSchema);
  }
  const resolved = propertySchema ? resolveSchema(propertySchema, rootSchema) : undefined;
  const types = resolved ? normalizeTypes(resolved.type) : ["string"];
  if (types.includes("boolean")) {
    return parseBooleanToken(trimmed);
  }
  if (types.includes("number") || types.includes("integer")) {
    const n = Number(trimmed);
    if (Number.isNaN(n)) {
      throw new Error("Expected number");
    }
    if (types.includes("integer") && !Number.isInteger(n)) {
      throw new Error("Expected integer");
    }
    return n;
  }
  if (types.includes("array")) {
    if (!resolved) {
      throw new Error("Use --json for object or array config values");
    }
    const parsed = parseHomogeneousPrimitiveArray(trimmed, resolved, rootSchema);
    return validateParsedConfigValue(parsed, propertySchema, rootSchema);
  }
  if (types.includes("object")) {
    throw new Error("Use --json for object or array config values");
  }
  return raw;
}

// ../../src/config/bootstrap.ts
function bootstrapAppConfig(program, opts) {
  let fileData;
  if (opts.validateFile === true) {
    fileData = readAppConfigFile(program);
  } else if (opts.validateFile === "soft") {
    try {
      fileData = readAppConfigFile(program);
      if (opts.runtime) {
        delete opts.runtime.state.configFileError;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
      if (opts.runtime) {
        opts.runtime.state.configFileError = message;
      }
      opts.emitter?.emit({
        level: "warn",
        message,
        action: "config.invalid"
      });
    }
  } else {
    fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
  }
  const hostEnv = captureMappedHostEnv(program);
  const resolved = resolveAppConfig(program, fileData, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
  return { fileData, resolved };
}
function readSensitiveLine() {
  const stdin = process.stdin;
  const canRaw = stdin.isTTY && typeof stdin.setRawMode === "function";
  const wasRaw = canRaw && stdin.isRaw;
  if (canRaw) {
    try {
      stdin.setRawMode(true);
    } catch {}
  }
  try {
    let result = "";
    const buf = Buffer.alloc(1);
    while (true) {
      const n = readSync2(0, buf, { length: 1 });
      if (n <= 0) {
        break;
      }
      const byte = buf[0];
      if (byte === 3) {
        process.stderr.write(`
`);
        process.exit(130);
      }
      if (byte === 4) {
        break;
      }
      if (byte === 10 || byte === 13) {
        break;
      }
      if (byte === 127 || byte === 8) {
        if (result.length > 0) {
          result = result.slice(0, -1);
          process.stderr.write("\b \b");
        }
        continue;
      }
      result += String.fromCharCode(byte);
      process.stderr.write("*");
    }
    process.stderr.write(`
`);
    return result;
  } finally {
    if (canRaw) {
      try {
        stdin.setRawMode(!!wasRaw);
      } catch {}
    }
  }
}
function readPromptLine2(mask) {
  if (mask) {
    return readSensitiveLine();
  }
  return readPromptLine();
}
function resolvedFromEnv(entry, hostEnv) {
  if (!entry.env) {
    return false;
  }
  const val = hostEnv[entry.env];
  return val !== undefined && val.length > 0;
}
function promptConfigKey(key, entry, current, configure, jsonSchemaRequired, hostEnv, jsonSchema) {
  const baseTitle = entry.title ?? defaultConfigEntryTitle(key);
  const titleWithEnv = entry.env ? `${baseTitle} (${entry.env})` : baseTitle;
  const required = configEntryRequired(key, entry, jsonSchemaRequired);
  const heading = required || !configure ? titleWithEnv : `${titleWithEnv} (optional)`;
  const propSchema = jsonSchema ? configPropertySchema(jsonSchema, key) : undefined;
  const valueHint = jsonSchema ? configValueInputHint(propSchema, jsonSchema) : undefined;
  const valueHintSuffix = valueHint ? ` (${valueHint})` : "";
  process.stderr.write(`${heading}
`);
  process.stderr.write(`  ${entry.description}
`);
  const hasCurrent = current !== undefined && current !== null && String(current).length > 0;
  const sensitive = configEntrySensitive(key, entry);
  if (hasCurrent) {
    process.stderr.write(`  Current: ${sensitive ? "REDACTED" : stringifyConfigValue(current)}
`);
    const acceptPrompt = resolvedFromEnv(entry, hostEnv) ? `  Value (Enter to use env)${valueHintSuffix}: ` : `  Value (Enter to keep)${valueHintSuffix}: `;
    process.stderr.write(acceptPrompt);
  } else {
    process.stderr.write(`  Value${valueHintSuffix}: `);
  }
  const input = readPromptLine2(sensitive);
  if (input.length === 0 && hasCurrent) {
    return { value: current, userTyped: false };
  }
  if (input.length > 0) {
    const rootSchema = jsonSchema ?? { type: "object", properties: {} };
    const parsed = parseConfigSetValue(input, propSchema, rootSchema, false);
    return { value: parsed, userTyped: true };
  }
  return { value: undefined, userTyped: false };
}
function writeConfigureSetupHeading() {
  process.stderr.write(`
Configuration Setup

`);
}
function shouldShowConfigureSetupHeading(program) {
  if (!program.appConfig)
    return false;
  return Object.keys(program.appConfig.entries).length > 0;
}
function isPresent3(value) {
  if (value === undefined || value === null)
    return false;
  if (typeof value === "string" && value.length === 0)
    return false;
  return true;
}
function bindingsDiffer(a, b) {
  return JSON.stringify(readBindings(a)) !== JSON.stringify(readBindings(b));
}
function shouldWizardPromptConfigKey(key, fileData, entry, resolved, opts) {
  const bindings = readBindings(fileData);
  if (bindings[key] === "env" && !isPresent3(resolved[key])) {
    return true;
  }
  if (opts.rePromptAll) {
    return true;
  }
  return !isKeyAddressed(key, fileData, entry);
}
function promptMissingRequired(program) {
  const appConfig = program.appConfig;
  const updates = {};
  if (!appConfig) {
    return updates;
  }
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const hostEnv = captureMappedHostEnv(program);
  const path = resolveAppConfigPath(program);
  const fileData = readAppConfigFileRaw(path);
  const resolved = resolveAppConfig(program, fileData, hostEnv);
  let headingWritten = false;
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!configEntryRequired(key, entry, fromSchema)) {
      continue;
    }
    const bindings = readBindings(fileData);
    if (bindings[key] === "env" && !isPresent3(resolved[key])) {} else if (isKeyAddressed(key, fileData, entry) && isPresent3(resolved[key])) {
      continue;
    }
    const current = resolved[key];
    if (!headingWritten) {
      writeConfigureSetupHeading();
      headingWritten = true;
    }
    const { value, userTyped } = promptConfigKey(key, entry, current, false, fromSchema, hostEnv, jsonSchema);
    if (userTyped && value !== undefined && String(value).length > 0) {
      updates[key] = value;
      Object.assign(updates, setBinding(updates, key, "file"));
    }
  }
  return updates;
}
function runConfigure(program, opts = {}) {
  if (!program.appConfig) {
    throw new Error("configure requires program.appConfig on the program root.");
  }
  if (!process.stdin.isTTY) {
    const { resolved: resolved2 } = bootstrapAppConfig(program, { validateFile: false });
    const missing = missingRequiredConfig(program, resolved2);
    if (missing.length > 0) {
      process.stderr.write(`${formatMissingConfigMessage(program, missing)}
`);
    } else {
      process.stderr.write(`configure requires an interactive terminal.
`);
    }
    process.exit(1);
  }
  const path = resolveAppConfigPath(program);
  const existing = readAppConfigFileRaw(path);
  const hostEnv = captureMappedHostEnv(program);
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const resolved = resolveAppConfig(program, existing, hostEnv);
  let next = { ...existing };
  let changed = false;
  if (opts.showHeading !== false && shouldShowConfigureSetupHeading(program)) {
    writeConfigureSetupHeading();
  }
  for (const [key, entry] of Object.entries(program.appConfig.entries)) {
    if (!shouldWizardPromptConfigKey(key, existing, entry, resolved, opts)) {
      continue;
    }
    const before = next[key];
    const bindingsBefore = readBindings(next);
    const current = resolved[key];
    const required = configEntryRequired(key, entry, fromSchema);
    const { value, userTyped } = promptConfigKey(key, entry, current, true, fromSchema, hostEnv, jsonSchema);
    if (userTyped && value !== undefined && String(value).length > 0) {
      if (JSON.stringify(value) !== JSON.stringify(before) || bindingsBefore[key] !== "file") {
        changed = true;
      }
      next = setBinding({ ...next, [key]: value }, key, "file");
      continue;
    }
    if (!userTyped && isPresent3(current) && resolvedFromEnv(entry, hostEnv)) {
      const storedInFile = key in existing && existing[key] !== undefined && existing[key] !== null && String(existing[key]).length > 0;
      if (!storedInFile) {
        const withBinding = setBinding(clearFileValue(next, key), key, "env");
        if (bindingsDiffer(next, withBinding) || key in next) {
          changed = true;
        }
        next = withBinding;
      }
      continue;
    }
    if (!userTyped && !required && !isPresent3(current) && inputWasSkipped(value, userTyped)) {
      const withBinding = setBinding(next, key, "skip");
      if (bindingsDiffer(next, withBinding)) {
        changed = true;
      }
      next = withBinding;
    }
  }
  if (changed) {
    writeAppConfigFile(program, next, { partial: true });
    const updated = resolveAppConfig(program, next, hostEnv);
    exportConfigToEnv(program, updated, hostEnv);
    return { path, changed: true };
  }
  return { path, changed: false };
}
function inputWasSkipped(value, userTyped) {
  return !userTyped && (value === undefined || String(value).length === 0);
}
function appConfigStatus(program) {
  if (!program.appConfig) {
    return;
  }
  const path = displayAppConfigPath(program);
  let fileData = {};
  try {
    fileData = readAppConfigFile(program);
  } catch {
    fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
  }
  const hostEnv = captureMappedHostEnv(program);
  const resolved = resolveAppConfig(program, fileData, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const required = Object.entries(program.appConfig.entries).filter(([key, entry]) => configEntryRequired(key, entry, fromSchema)).map(([key]) => {
    const set = resolved[key] !== undefined && resolved[key] !== null && String(resolved[key]).length > 0;
    return {
      key,
      set,
      binding: bindingForKey(key, fileData, set)
    };
  });
  return { path, exists: appConfigFileExists(program), required };
}
function ensureAppConfig(program, opts) {
  if (!program.appConfig) {
    return;
  }
  let fileData;
  try {
    fileData = readAppConfigFile(program);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}
`);
    process.exit(1);
  }
  const hostEnv = captureMappedHostEnv(program);
  let resolved = resolveAppConfig(program, fileData, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
  if (opts.interactive && process.stdin.isTTY) {
    if (opts.configure) {
      runConfigure(program, { context: "standalone", rePromptAll: true });
      fileData = readAppConfigFileRaw(resolveAppConfigPath(program));
      resolved = resolveAppConfig(program, fileData, hostEnv);
      exportConfigToEnv(program, resolved, hostEnv);
      return { fileData, resolved };
    }
    const updates = promptMissingRequired(program);
    if (Object.keys(updates).length > 0) {
      const merged = { ...fileData, ...updates };
      writeAppConfigFile(program, merged, { partial: true });
      fileData = merged;
      resolved = resolveAppConfig(program, fileData, hostEnv);
      exportConfigToEnv(program, resolved, hostEnv);
    }
  }
  const missing = missingRequiredConfig(program, resolved);
  if (missing.length === 0) {
    return { fileData, resolved };
  }
  if (opts.exitOnMissing) {
    process.stderr.write(`${formatMissingConfigMessage(program, missing)}
`);
    process.exit(1);
  }
  return { fileData, resolved };
}

// ../../src/utils.ts
function fullStringIsDouble(s) {
  if (s.trim().length === 0)
    return false;
  const num = Number(s);
  if (Number.isNaN(num))
    return false;
  return !Number.isNaN(parseFloat(s)) && Number.isFinite(num);
}
function strictParseDouble(s) {
  if (!fullStringIsDouble(s))
    return null;
  const num = Number(s);
  return Number.isNaN(num) ? null : num;
}
var isInteractiveTty = !!process.stdin.isTTY;

// ../../src/core/parse.ts
var helpShort = "-h";
var helpLong = "--help";
function isHelpTok(tok) {
  return tok === helpShort || tok === helpLong;
}
function findChild(cmds, name) {
  return cmds.find((c) => c.key === name);
}
function isParamRouterKey2(key) {
  return key.startsWith(":");
}
function findStaticChild(cmds, name) {
  const ch = cmds.find((c) => c.key === name);
  if (!ch || isParamRouterKey2(ch.key)) {
    return;
  }
  return ch;
}
function findParamChild(cmds) {
  return cmds.find((c) => isParamRouterKey2(c.key));
}
function findOptionByName(defs, name) {
  return defs.find((o) => o.name === name);
}
function findOptionDefByShort(defs, short) {
  return defs.find((o) => o.shortName === short);
}
function consumeOptions(defs, lenientUnknown, argv, i, opts) {
  let idx = i;
  function consumeLong(tok) {
    const body = tok.slice(2);
    let optName;
    let inlineVal;
    const eqIdx = body.indexOf("=");
    if (eqIdx !== -1) {
      optName = body.slice(0, eqIdx);
      inlineVal = body.slice(eqIdx + 1);
    } else {
      optName = body;
      inlineVal = undefined;
    }
    const def = findOptionByName(defs, optName);
    if (!def) {
      if (lenientUnknown)
        return "";
      return `Unknown option: --${optName}`;
    }
    if (inlineVal !== undefined) {
      if (def.kind === "presence" /* Presence */) {
        opts[def.name] = "1";
      } else {
        opts[def.name] = inlineVal;
      }
      idx += 1;
      return null;
    }
    if (def.kind === "presence" /* Presence */) {
      opts[def.name] = "1";
    } else {
      idx += 1;
      if (idx >= argv.length) {
        return `Missing value for option: --${optName}`;
      }
      opts[def.name] = argv[idx];
    }
    idx += 1;
    return null;
  }
  function consumeShort(tok) {
    if (tok.length < 2)
      return `Unexpected option token: ${tok}`;
    const shorts = tok.slice(1);
    let j = 0;
    while (j < shorts.length) {
      const shortChar = shorts[j];
      const def = findOptionDefByShort(defs, shortChar);
      if (!def) {
        if (lenientUnknown)
          return "";
        return `Unknown option: -${shortChar}`;
      }
      if (def.kind === "presence" /* Presence */) {
        opts[def.name] = "1";
        j += 1;
        continue;
      }
      if (j !== 0 || j + 1 < shorts.length) {
        return `Short option -${shortChar} requires a value and cannot be bundled: ${tok}`;
      }
      idx += 1;
      if (idx >= argv.length) {
        return `Missing value for option: -${shortChar}`;
      }
      opts[def.name] = argv[idx];
      idx += 1;
      return null;
    }
    idx += 1;
    return null;
  }
  while (idx < argv.length) {
    const tok = argv[idx];
    if (isHelpTok(tok))
      break;
    if (!tok.startsWith("-"))
      break;
    if (tok === "--") {
      idx += 1;
      return {
        report: { err: null, stoppedOnUnknown: false, sawDoubleDash: true },
        nextIndex: idx
      };
    }
    if (tok.startsWith("--")) {
      const err = consumeLong(tok);
      if (err === "")
        return {
          report: { err: null, stoppedOnUnknown: true, sawDoubleDash: false },
          nextIndex: idx
        };
      if (err)
        return { report: { err, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
    } else {
      const err = consumeShort(tok);
      if (err === "")
        return {
          report: { err: null, stoppedOnUnknown: true, sawDoubleDash: false },
          nextIndex: idx
        };
      if (err)
        return { report: { err, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
    }
  }
  return { report: { err: null, stoppedOnUnknown: false, sawDoubleDash: false }, nextIndex: idx };
}
function resolveNodeAtPath(root, path) {
  if (path.length === 0) {
    return root;
  }
  let node = root;
  for (const seg of path) {
    if (!isCliRouter(node)) {
      return;
    }
    const ch = findChild(node.commands, seg);
    if (!ch) {
      return;
    }
    node = ch;
  }
  return node;
}
function collectPathOptionDefs(root, path) {
  const defs = [...root.options ?? []];
  let node = root;
  for (const seg of path) {
    if (!isCliRouter(node)) {
      break;
    }
    const ch = findChild(node.commands, seg);
    if (!ch) {
      break;
    }
    defs.push(...ch.options ?? []);
    node = ch;
  }
  return defs;
}
function collectOptionDefs(root, path) {
  const node = resolveNodeAtPath(root, path);
  if (!node || !isCliLeaf(node)) {
    return [];
  }
  return [...node.options ?? []];
}
function finishJsonLeaf(node, startIdx, argv, path, opts, pathParams) {
  let idx = startIdx;
  const args = [];
  if (idx < argv.length) {
    const tok = argv[idx];
    if (isHelpTok(tok)) {
      return helpResult(path, true, pathParams);
    }
    if (tok === "--") {
      return errorResult("Unexpected extra arguments", path, [], pathParams);
    }
    if (tok.startsWith("-")) {
      const kindLabel = node.kind === "document" ? "Document" : "JSON";
      return errorResult(`${kindLabel} commands do not accept options: ${tok}`, path, [], pathParams);
    }
    args.push(tok);
    idx += 1;
  }
  if (idx < argv.length) {
    return errorResult("Unexpected extra arguments", path, [], pathParams);
  }
  return {
    kind: "ok" /* Ok */,
    path,
    opts,
    args,
    pathParams,
    helpExplicit: false,
    helpPath: [],
    errorMsg: "",
    errorHelpPath: []
  };
}
function finishLeaf(node, startIdx, argv, path, opts, optionDefs, forcePositionalsIn, pathParams) {
  let idx = startIdx;
  const args = [];
  let forcePositionals = forcePositionalsIn;
  function consumePendingOptions() {
    while (!forcePositionals && idx < argv.length) {
      const tok = argv[idx];
      if (tok === "--") {
        forcePositionals = true;
        idx += 1;
        break;
      }
      if (isHelpTok(tok)) {
        return helpResult(path, true, pathParams);
      }
      if (tok.startsWith("-")) {
        const rep = consumeOptions(optionDefs, false, argv, idx, opts);
        if (rep.report.err) {
          return errorResult(rep.report.err, path, [], pathParams);
        }
        if (rep.report.sawDoubleDash) {
          forcePositionals = true;
        }
        if (rep.nextIndex > idx) {
          idx = rep.nextIndex;
          continue;
        }
        return errorResult(`Unexpected option token: ${tok}`, path, [], pathParams);
      }
      break;
    }
    return null;
  }
  for (const p of node.positionals ?? []) {
    const { argMin = 1, argMax = 1 } = p;
    if (argMax === 1) {
      const pendingErr = consumePendingOptions();
      if (pendingErr)
        return pendingErr;
      if (argMin >= 1) {
        if (idx >= argv.length) {
          return errorResult(`Missing positional argument: ${p.name}`, path, [], pathParams);
        }
        args.push(argv[idx]);
        idx += 1;
      } else if (idx < argv.length) {
        args.push(argv[idx]);
        idx += 1;
      }
      continue;
    }
    let count = 0;
    if (argMax === 0) {
      while (idx < argv.length) {
        const pendingErr = consumePendingOptions();
        if (pendingErr)
          return pendingErr;
        if (idx >= argv.length)
          break;
        args.push(argv[idx]);
        idx += 1;
        count += 1;
      }
    } else {
      while (count < argMax && idx < argv.length) {
        const pendingErr = consumePendingOptions();
        if (pendingErr)
          return pendingErr;
        if (idx >= argv.length)
          break;
        args.push(argv[idx]);
        idx += 1;
        count += 1;
      }
    }
    if (count < argMin) {
      return errorResult(`Expected at least ${argMin} argument(s) for ${p.name}, got ${count}`, path, [], pathParams);
    }
  }
  const trailingErr = consumePendingOptions();
  if (trailingErr)
    return trailingErr;
  if (idx < argv.length) {
    return errorResult("Unexpected extra arguments", path, [], pathParams);
  }
  return {
    kind: "ok" /* Ok */,
    path,
    opts,
    args,
    pathParams,
    helpExplicit: false,
    helpPath: [],
    errorMsg: "",
    errorHelpPath: []
  };
}
function errorResult(errorMsg, errorHelpPath = [], path = errorHelpPath, pathParams = {}) {
  return {
    kind: "error" /* Error */,
    path,
    opts: {},
    args: [],
    pathParams,
    helpExplicit: false,
    helpPath: [],
    errorMsg,
    errorHelpPath
  };
}
function helpResult(p, explicit, pathParams = {}) {
  return {
    kind: "help" /* Help */,
    path: [],
    opts: {},
    args: [],
    pathParams,
    helpExplicit: explicit,
    helpPath: p,
    errorMsg: "",
    errorHelpPath: []
  };
}
function descendChild(parent, tok, path, pathParams, cliEnabled) {
  const staticChild = findStaticChild(parent.commands, tok);
  if (staticChild) {
    if (!isCliCallable(staticChild, cliEnabled)) {
      return { ok: false, error: errorResult(`Unknown subcommand: ${tok}`, path, [], pathParams) };
    }
    path.push(tok);
    return { ok: true, node: staticChild, cliEnabled: isCliCallable(staticChild, cliEnabled) };
  }
  const paramChild = findParamChild(parent.commands);
  if (paramChild && isCliCallable(paramChild, cliEnabled)) {
    const paramName = paramChild.key.slice(1);
    path.push(paramChild.key);
    pathParams[paramName] = tok;
    return { ok: true, node: paramChild, cliEnabled: isCliCallable(paramChild, cliEnabled) };
  }
  return { ok: false, error: errorResult(`Unknown subcommand: ${tok}`, path, [], pathParams) };
}
function parse(root, argv) {
  let i = 0;
  const path = [];
  const pathParams = {};
  const opts = {};
  let cliEnabled = true;
  const rootLenient = isCliRouter(root) && root.fallbackCommand !== undefined && ((root.fallbackMode ?? "missingOnly" /* MissingOnly */) === "missingOrUnknown" /* MissingOrUnknown */ || (root.fallbackMode ?? "missingOnly" /* MissingOnly */) === "unknownOnly" /* UnknownOnly */);
  const rootRep = consumeOptions(root.options ?? [], rootLenient, argv, i, opts);
  if (rootRep.report.err) {
    return errorResult(rootRep.report.err);
  }
  i = rootRep.nextIndex;
  let forcePositionals = rootRep.report.sawDoubleDash;
  if (i < argv.length && !forcePositionals && isHelpTok(argv[i])) {
    return helpResult([], true);
  }
  let cmdName;
  let node;
  if (isCliLeaf(root)) {
    if (isDocumentLeaf(root)) {
      return finishJsonLeaf(root, i, argv, path, opts, pathParams);
    }
    return finishLeaf(root, i, argv, path, opts, root.options ?? [], forcePositionals, pathParams);
  }
  if (i >= argv.length) {
    if (root.fallbackCommand !== undefined && ((root.fallbackMode ?? "missingOnly" /* MissingOnly */) === "missingOnly" /* MissingOnly */ || (root.fallbackMode ?? "missingOnly" /* MissingOnly */) === "missingOrUnknown" /* MissingOrUnknown */)) {
      cmdName = root.fallbackCommand;
      node = findChild(root.commands, cmdName);
      if (!node) {
        return errorResult(`Unknown command: ${cmdName}`, path, []);
      }
    } else {
      return helpResult([], false);
    }
  } else {
    const peek = argv[i];
    const childPick = !forcePositionals ? findStaticChild(root.commands, peek) : undefined;
    if (childPick !== undefined) {
      if (!isCliCallable(childPick, cliEnabled)) {
        return errorResult(`Unknown command: ${peek}`, path, [], pathParams);
      }
      cmdName = peek;
      i += 1;
      node = childPick;
      cliEnabled = isCliCallable(childPick, cliEnabled);
    } else if (!forcePositionals && isCliRouter(root)) {
      const paramChild = findParamChild(root.commands);
      if (paramChild && isCliCallable(paramChild, cliEnabled)) {
        cmdName = paramChild.key;
        pathParams[paramChild.key.slice(1)] = peek;
        i += 1;
        node = paramChild;
        cliEnabled = isCliCallable(paramChild, cliEnabled);
      } else {
        const fallbackCommand = root.fallbackCommand;
        const canRouteUnknown = fallbackCommand !== undefined && ((root.fallbackMode ?? "missingOnly" /* MissingOnly */) === "missingOrUnknown" /* MissingOrUnknown */ || (root.fallbackMode ?? "missingOnly" /* MissingOnly */) === "unknownOnly" /* UnknownOnly */);
        if (canRouteUnknown) {
          cmdName = fallbackCommand;
          node = findChild(root.commands, cmdName);
          if (!node) {
            return errorResult(`Unknown command: ${cmdName}`, path, [], pathParams);
          }
        } else {
          return errorResult(`Unknown command: ${peek}`, path, [], pathParams);
        }
      }
    } else {
      const fallbackCommand = root.fallbackCommand;
      const canRouteUnknown = fallbackCommand !== undefined && ((root.fallbackMode ?? "missingOnly" /* MissingOnly */) === "missingOrUnknown" /* MissingOrUnknown */ || (root.fallbackMode ?? "missingOnly" /* MissingOnly */) === "unknownOnly" /* UnknownOnly */);
      if (canRouteUnknown) {
        cmdName = fallbackCommand;
        node = findChild(root.commands, cmdName);
        if (!node) {
          return errorResult(`Unknown command: ${cmdName}`, path, []);
        }
      } else {
        cmdName = peek;
        if (!forcePositionals)
          i += 1;
        node = findChild(root.commands, cmdName);
        if (!node) {
          return errorResult(forcePositionals ? `Expected subcommand but got positional: ${cmdName}` : `Unknown command: ${cmdName}`, path, []);
        }
      }
    }
  }
  path.push(cmdName);
  if (!node) {
    return errorResult(`Unknown command: ${cmdName}`, path);
  }
  let current = node;
  while (true) {
    if (isCliLeaf(current) && isDocumentLeaf(current)) {
      return finishJsonLeaf(current, i, argv, path, opts, pathParams);
    }
    if (!forcePositionals) {
      const orep = consumeOptions(current.options ?? [], false, argv, i, opts);
      if (orep.report.err) {
        return errorResult(orep.report.err, path);
      }
      i = orep.nextIndex;
      if (orep.report.sawDoubleDash) {
        forcePositionals = true;
      }
    }
    if (i < argv.length && !forcePositionals && isHelpTok(argv[i])) {
      return helpResult(path, true, pathParams);
    }
    if (i >= argv.length) {
      if (isCliRouter(current) && current.commands.length > 0) {
        const fb = current.fallbackCommand;
        const fm = current.fallbackMode ?? "missingOnly" /* MissingOnly */;
        if (fb !== undefined && (fm === "missingOnly" /* MissingOnly */ || fm === "missingOrUnknown" /* MissingOrUnknown */)) {
          const fbNode = findChild(current.commands, fb);
          if (fbNode) {
            path.push(fb);
            current = fbNode;
            cliEnabled = isCliCallable(fbNode, cliEnabled);
            continue;
          }
        }
        return helpResult(path, false, pathParams);
      }
      if (!isCliLeaf(current)) {
        return helpResult(path, false, pathParams);
      }
      return finishLeaf(current, i, argv, path, opts, current.options ?? [], forcePositionals, pathParams);
    }
    const tok = argv[i];
    if (!forcePositionals && tok.startsWith("-")) {
      return errorResult(`Unexpected option token: ${tok}`, path, [], pathParams);
    }
    if (!forcePositionals && isCliRouter(current)) {
      const descended = descendChild(current, tok, path, pathParams, cliEnabled);
      if (descended.ok) {
        i += 1;
        current = descended.node;
        cliEnabled = descended.cliEnabled;
        continue;
      }
    }
    if (isCliRouter(current) && current.commands.length > 0) {
      const fb = current.fallbackCommand;
      const fm = current.fallbackMode ?? "missingOnly" /* MissingOnly */;
      const canRouteUnknown = fb !== undefined && (fm === "missingOrUnknown" /* MissingOrUnknown */ || fm === "unknownOnly" /* UnknownOnly */);
      if (canRouteUnknown && fb !== undefined) {
        const fbNode = findChild(current.commands, fb);
        if (fbNode) {
          path.push(fb);
          current = fbNode;
          cliEnabled = isCliCallable(fbNode, cliEnabled);
          continue;
        }
      }
      return errorResult(forcePositionals ? `Expected subcommand but got positional: ${tok}` : `Unknown subcommand: ${tok}`, path, [], pathParams);
    }
    if (!isCliLeaf(current)) {
      return helpResult(path, false, pathParams);
    }
    return finishLeaf(current, i, argv, path, opts, current.options ?? [], forcePositionals, pathParams);
  }
}
function postParseValidate(root, pr) {
  if (pr.kind !== "ok" /* Ok */)
    return pr;
  const defs = collectPathOptionDefs(root, pr.path);
  const opts = { ...pr.opts };
  for (const d of defs) {
    if (d.default !== undefined && !(d.name in opts)) {
      opts[d.name] = d.default;
    }
  }
  for (const d of defs) {
    if (d.required && !(d.name in opts)) {
      if (d.kind === "json" /* Json */) {
        continue;
      }
      return errorResult(`Missing required option: --${d.name}`, pr.path);
    }
  }
  for (const [k, v] of Object.entries(opts)) {
    const d = findOptionByName(defs, k);
    if (!d) {
      return errorResult(`Unknown option key: ${k}`, pr.path);
    }
    if (d.kind === "json" /* Json */) {
      try {
        JSON.parse(v);
      } catch {
        return errorResult(`Invalid JSON for option --${k}`, pr.path);
      }
      continue;
    }
    if (d.kind === "number" /* Number */) {
      if (!fullStringIsDouble(v)) {
        return errorResult(`Invalid number for option --${k}: ${v}`, pr.path);
      }
    }
    if (d.kind === "enum" /* Enum */) {
      const choices = d.choices ?? [];
      if (!choices.includes(v)) {
        return errorResult(`Option --${k}: '${v}' is not one of: ${choices.join(", ")}`, pr.path);
      }
    }
    if (d.kind === "string" /* String */ && (d.format !== undefined || d.pattern !== undefined)) {
      try {
        validateFormatValue(v, d.format, d.pattern);
      } catch (err) {
        const msg = d.format !== undefined ? formatValidationError(d.format, v) : err instanceof Error ? err.message : String(err);
        return errorResult(`Invalid value for option --${k}: ${msg}`, pr.path);
      }
    }
  }
  return { ...pr, opts };
}

// ../../src/core/leaf-inputs.ts
class LeafInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "LeafInputError";
  }
}
var DOCUMENT_LEAF_BODY_KEY = "__documentLeafBody";
var JSON_LEAF_BODY_KEY = DOCUMENT_LEAF_BODY_KEY;
function resolveLeaf(program, commandPath2) {
  let node = program;
  for (const seg of commandPath2) {
    if (!isCliRouter(node))
      return;
    const child = node.commands.find((c) => c.key === seg);
    if (!child)
      return;
    node = child;
  }
  return isCliLeaf(node) ? node : undefined;
}
function leafNode(ctx) {
  return resolveLeaf(ctx.program, ctx.commandPath);
}
function parseJsonText(raw, label) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new LeafInputError(`${label}: JSON value is empty`);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new LeafInputError(`${label}: invalid JSON`);
  }
}
function parseDocumentText(raw, label) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new LeafInputError(`${label}: value is empty`);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }
  try {
    return Bun.YAML.parse(trimmed);
  } catch {
    throw new LeafInputError(`${label}: invalid JSON or YAML`);
  }
}
async function readPipedJsonStdin() {
  const raw = await new Response(Bun.stdin).text();
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new LeafInputError("stdin is empty; pass JSON via the option flag or pipe a JSON document to stdin");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new LeafInputError("stdin is not valid JSON");
  }
}
function jsonLeafBodyHelp(kind = "json") {
  if (kind === "document") {
    return "Missing document input: pass a JSON or YAML document as an argument or pipe to stdin";
  }
  return "Missing JSON input: pass a JSON document as an argument or pipe to stdin";
}
async function readPipedJsonStdinForJsonLeaf(kind = "json") {
  const raw = await new Response(Bun.stdin).text();
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new LeafInputError(jsonLeafBodyHelp(kind));
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }
  try {
    return Bun.YAML.parse(trimmed);
  } catch {
    throw new LeafInputError("stdin is not valid JSON or YAML");
  }
}
function pipableJsonHelp(opt) {
  return `Missing required option --${opt.name}: pass JSON via --${opt.name} '<json>' or pipe a JSON document to stdin`;
}
function omitUndefinedInputs(out) {
  const stripped = {};
  for (const [key, value] of Object.entries(out)) {
    if (value !== undefined) {
      stripped[key] = value;
    }
  }
  return stripped;
}
function validateAgainstInputSchema(out, inputSchema) {
  const result = validateConfigDocument(omitUndefinedInputs(out), inputSchema);
  if (!result.valid) {
    throw new LeafInputError(result.errors.join("; "));
  }
}
function readJsonOptionValue(ctx, name) {
  const flagValue = ctx.stringOpt(name);
  if (flagValue !== undefined) {
    return parseJsonText(flagValue, `--${name}`);
  }
  if (name in ctx.preloadedJson) {
    return ctx.preloadedJson[name];
  }
  if (ctx.toolArgs !== undefined && name in ctx.toolArgs) {
    return ctx.toolArgs[name];
  }
  return;
}
async function preloadPipableJson(program, commandPath2, opts, invocation, args = []) {
  if (invocation !== "cli" || isInteractiveTty) {
    return {};
  }
  const leaf = resolveLeaf(program, commandPath2);
  if (leaf && isDocumentLeaf(leaf) && args.length === 0) {
    return { [JSON_LEAF_BODY_KEY]: await readPipedJsonStdinForJsonLeaf(leaf.kind) };
  }
  for (const opt of collectOptionDefs(program, commandPath2)) {
    if (opt.kind === "json" /* Json */ && opt.pipable && !(opt.name in opts)) {
      return { [opt.name]: await readPipedJsonStdin() };
    }
  }
  return {};
}
function readSyncOptionValue(ctx, opt) {
  if (opt.kind === "presence" /* Presence */) {
    return ctx.hasFlag(opt.name);
  }
  if (opt.kind === "number" /* Number */) {
    const n = ctx.numberOpt(opt.name);
    return n === null ? undefined : n;
  }
  if (opt.kind === "json" /* Json */) {
    return readJsonOptionValue(ctx, opt.name);
  }
  if (opt.format !== undefined) {
    if (opt.format === "duration" /* Duration */) {
      return ctx.durationOpt(opt.name);
    }
    if (opt.format === "comma-list" /* CommaList */) {
      return ctx.commaListOpt(opt.name);
    }
    if (opt.format === "date" /* Date */) {
      return ctx.dateOpt(opt.name);
    }
    if (opt.format === "date-time" /* DateTime */) {
      return ctx.dateTimeOpt(opt.name);
    }
  }
  return ctx.stringOpt(opt.name);
}
function loadLeafInputs(ctx) {
  const leaf = leafNode(ctx);
  if (!leaf)
    return {};
  if (isDocumentLeaf(leaf)) {
    let body;
    if (ctx.toolArgs !== undefined) {
      body = ctx.toolArgs;
    } else if (ctx.args.length > 0) {
      const [arg0] = ctx.args;
      if (arg0 === undefined) {
        throw new LeafInputError(jsonLeafBodyHelp(leaf.kind));
      }
      const label = leaf.kind === "document" ? "Document argument" : "JSON argument";
      body = parseDocumentText(arg0, label);
    } else if (JSON_LEAF_BODY_KEY in ctx.preloadedJson) {
      body = ctx.preloadedJson[JSON_LEAF_BODY_KEY];
    } else {
      throw new LeafInputError(jsonLeafBodyHelp(leaf.kind));
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      if (leaf.kind === "document") {
        throw new LeafInputError("Document input must be a JSON or YAML object");
      }
      throw new LeafInputError("JSON input must be a JSON object");
    }
    const out2 = body;
    if (leaf.inputSchema !== undefined) {
      validateAgainstInputSchema(out2, leaf.inputSchema);
    }
    return omitUndefinedInputs(out2);
  }
  const out = {};
  const options = collectOptionDefs(ctx.program, ctx.commandPath);
  for (const opt of options) {
    out[opt.name] = readSyncOptionValue(ctx, opt);
  }
  for (const p of leaf.positionals ?? []) {
    const val = ctx.positional(p.name);
    if (val === undefined) {
      out[p.name] = undefined;
    } else if (Array.isArray(val)) {
      out[p.name] = val;
    } else {
      out[p.name] = val;
    }
  }
  for (const [name, value] of Object.entries(ctx.pathParams)) {
    if (out[name] === undefined) {
      out[name] = value;
    }
  }
  if (ctx.toolArgs !== undefined) {
    for (const [key, value] of Object.entries(ctx.toolArgs)) {
      if (out[key] === undefined) {
        out[key] = value;
      }
    }
  }
  for (const opt of options) {
    if (opt.required && out[opt.name] === undefined) {
      if (opt.kind === "json" /* Json */ && opt.pipable && ctx.invocation === "cli" && isInteractiveTty) {
        throw new LeafInputError(pipableJsonHelp(opt));
      }
      throw new LeafInputError(`Missing required option: --${opt.name}`);
    }
  }
  if (leaf.inputSchema !== undefined) {
    validateAgainstInputSchema(out, leaf.inputSchema);
  }
  return omitUndefinedInputs(out);
}

// ../../src/http/result.ts
function stripAnsi(text) {
  const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  return text.replace(ansiEscape, "");
}
function firstErrorLine(text) {
  const line = stripAnsi(text).split(`
`).map((part) => part.trim()).find((part) => part.length > 0);
  return line ?? stripAnsi(text).trim();
}
var API_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
  "access-control-max-age": "86400"
};
function apiOptionsResponse() {
  return new Response(null, { status: 204, headers: { ...API_CORS_HEADERS } });
}
function resolveRespondContentType(response, leafApiResponse) {
  return response.contentType ?? leafApiResponse?.contentType ?? (typeof response.body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8");
}
function apiSuccessResponse(response, leafApiResponse, defaultStatus) {
  const contentType = resolveRespondContentType(response, leafApiResponse);
  const headers = {
    ...API_CORS_HEADERS,
    "content-type": contentType,
    ...response.headers ?? {}
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
    return new Response(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), {
      status,
      headers
    });
  }
  if (typeof body === "string") {
    return new Response(body, { status, headers });
  }
  return new Response(JSON.stringify(body), { status, headers });
}
function apiErrorResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...API_CORS_HEADERS,
      "content-type": "application/json; charset=utf-8"
    }
  });
}
function apiDocsHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Reference</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({
      url: "/openapi.json",
      dom_id: "#swagger-ui",
    });
  </script>
</body>
</html>`;
}

// ../../src/log/emitter.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ../../src/log/ecs.ts
var ECS_VERSION = "8.11.0";
var PROTECTED_ECS_KEYS = new Set([
  "@timestamp",
  "log.level",
  "message",
  "ecs.version",
  "service.name",
  "service.version"
]);
function errorFields(error) {
  if (error instanceof Error) {
    return {
      "error.message": error.message,
      "error.type": error.name,
      ...error.stack ? { "error.stack_trace": error.stack } : {}
    };
  }
  return { "error.message": String(error) };
}
function buildEnrichContext(service, event) {
  return {
    level: event.level,
    message: event.message,
    action: event.action,
    requestId: event.requestId,
    traceId: event.traceId,
    spanId: event.spanId,
    labels: event.labels,
    error: event.error,
    service,
    http: event.http
  };
}
function mergeEnrichFields(line, enrich) {
  if (!enrich) {
    return;
  }
  for (const [key, value] of Object.entries(enrich)) {
    if (PROTECTED_ECS_KEYS.has(key) || key in line) {
      continue;
    }
    line[key] = value;
  }
}
function formatEcsLine(serviceOrOpts, event) {
  const opts = event !== undefined ? { service: serviceOrOpts, event } : serviceOrOpts;
  const { service, event: ev } = opts;
  const line = {
    "@timestamp": new Date().toISOString(),
    "log.level": ev.level,
    message: ev.message,
    "ecs.version": ECS_VERSION,
    "service.name": service.name,
    "service.version": service.version
  };
  if (ev.action) {
    line["event.action"] = ev.action;
  }
  if (ev.traceId) {
    line["trace.id"] = ev.traceId;
  }
  if (ev.spanId) {
    line["span.id"] = ev.spanId;
  }
  if (ev.labels && Object.keys(ev.labels).length > 0) {
    line.labels = { ...ev.labels };
  }
  if (ev.fields) {
    Object.assign(line, ev.fields);
  }
  if (ev.error !== undefined) {
    Object.assign(line, errorFields(ev.error));
  }
  mergeEnrichFields(line, opts.enrich?.(buildEnrichContext(service, ev)));
  return JSON.stringify(line);
}
function durationMsToEcsNanos(durationMs) {
  return durationMs * 1e6;
}

// ../../src/log/emitter.ts
var OBSCURE_CLIENT_MESSAGE = "An unexpected error occurred.";
function obscureUnexpectedClientMessage() {
  return OBSCURE_CLIENT_MESSAGE;
}
class LogEmitter {
  service;
  resolved;
  constructor(opts) {
    this.service = { name: opts.program.key, version: opts.program.version };
    this.resolved = opts.resolved;
  }
  get config() {
    return this.resolved;
  }
  emit(event) {
    const line = this.formatLine(event);
    process.stderr.write(`${line}
`);
    this.appendFile(line);
  }
  emitLifecycle(message, action, labels) {
    if (this.resolved.format === "text") {
      process.stderr.write(`${message}
`);
      this.appendFile(message);
      return;
    }
    this.emit({ level: "info", message, action, labels });
  }
  emitAccess(fields) {
    if (!this.resolved.access) {
      return;
    }
    if (this.resolved.format === "text") {
      const rid = fields.requestId ? ` ${fields.requestId}` : "";
      const line = `${fields.method} ${fields.path} ${fields.status} ${fields.durationMs}ms${rid}`;
      process.stderr.write(`${line}
`);
      this.appendFile(line);
      return;
    }
    const isHttp = fields.method !== "MCP";
    const action = isHttp ? "http.access" : "mcp.access";
    const httpFields = isHttp ? {
      "http.request.method": fields.method,
      "url.path": fields.path,
      "http.response.status_code": fields.status,
      "event.duration": durationMsToEcsNanos(fields.durationMs)
    } : {
      "event.duration": durationMsToEcsNanos(fields.durationMs)
    };
    if (fields.clientIp && fields.clientIp !== "unknown") {
      httpFields["client.ip"] = fields.clientIp;
    }
    this.emit({
      level: "info",
      message: `${fields.method} ${fields.path}`,
      action,
      requestId: fields.requestId,
      traceId: fields.traceId,
      spanId: fields.spanId,
      fields: httpFields,
      labels: {
        ...fields.requestId ? { request_id: fields.requestId } : {},
        ...isHttp ? {} : { rpc_method: fields.path }
      },
      http: {
        method: fields.method,
        path: fields.path,
        status: fields.status,
        durationMs: fields.durationMs,
        clientIp: fields.clientIp
      }
    });
  }
  emitInvokeError(failureKind, error, clientMessage, meta) {
    if (!this.resolved.errors) {
      return;
    }
    this.emit({
      level: failureKind === "unexpected" ? "error" : "warn",
      message: clientMessage,
      action: "invoke.error",
      labels: { failure_kind: failureKind, ...meta?.labels },
      requestId: meta?.requestId,
      traceId: meta?.traceId,
      spanId: meta?.spanId,
      error
    });
    if (this.resolved.dev && error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}
`);
      this.appendFile(error.stack);
    }
  }
  formatLine(event) {
    if (this.resolved.format === "text") {
      return this.formatTextLine(event);
    }
    const enrichCtx = this.buildEnrichContext(event);
    if (this.resolved.serialize) {
      return this.resolved.serialize(enrichCtx);
    }
    return formatEcsLine({
      service: this.service,
      event,
      enrich: this.resolved.enrich
    });
  }
  buildEnrichContext(event) {
    return {
      level: event.level,
      message: event.message,
      action: event.action,
      requestId: event.requestId,
      traceId: event.traceId,
      spanId: event.spanId,
      labels: event.labels,
      error: event.error,
      service: this.service,
      http: event.http
    };
  }
  formatTextLine(event) {
    const level = event.level.toUpperCase();
    const action = event.action ? ` [${event.action}]` : "";
    let line = `${level}${action}: ${event.message}`;
    if (event.error instanceof Error && event.error.stack) {
      line = `${line}
${event.error.stack}`;
    }
    return line;
  }
  appendFile(line) {
    const file = this.resolved.file;
    if (!file) {
      return;
    }
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${line}
`, "utf8");
    } catch {}
  }
}

// ../../src/hooks/run.ts
async function runHook(hook, label) {
  if (!hook) {
    return;
  }
  try {
    return await Promise.resolve(hook());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} hook failed: ${message}`, { cause: err });
  }
}
function classifyFailureKind(err, opts) {
  if (opts.help) {
    return "help";
  }
  if (opts.missingConfig) {
    return "missing_config";
  }
  if (opts.notReady) {
    return "not_ready";
  }
  if (opts.parseError || err instanceof LeafInputError) {
    return "validation";
  }
  if (err instanceof Error) {
    return "validation";
  }
  return "unexpected";
}
function failureKindHttpStatus(kind) {
  switch (kind) {
    case "validation":
    case "help":
      return 400;
    case "unknown_route":
      return 404;
    case "missing_config":
    case "not_ready":
      return 503;
    case "unexpected":
      return 500;
  }
}
function buildInvokeHookContext(ctx, extras) {
  return {
    invocation: ctx.invocation,
    path: extras.path,
    pathParams: { ...ctx.pathParams },
    opts: ctx.opts,
    locals: ctx.locals,
    runtime: extras.runtime,
    appConfig: ctx.appConfig,
    http: extras.http,
    mcp: extras.mcp
  };
}
function defaultClientError(err, _failureKind) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : firstErrorLine(String(err)) || "Error";
  return { message, exitCode: 1 };
}
async function runErrorPipeline(hookCtx, err, failureKind, hooks, emitter, obscureUnexpected) {
  let clientError = defaultClientError(err, failureKind);
  if (failureKind === "unexpected" && obscureUnexpected) {
    clientError = { message: obscureUnexpectedClientMessage(), exitCode: 1 };
  }
  const errorCtx = {
    ...hookCtx,
    failureKind,
    error: err,
    clientError: { ...clientError }
  };
  const formatted = await runHook(() => hooks?.formatError?.(errorCtx), "formatError");
  if (formatted) {
    clientError = { ...clientError, ...formatted };
    errorCtx.clientError = { ...clientError };
  }
  await runHook(() => hooks?.onError?.(errorCtx), "onError");
  const displayMessage = failureKind === "unexpected" && obscureUnexpected ? obscureUnexpectedClientMessage() : clientError.message;
  emitter?.emitInvokeError(failureKind, err, displayMessage, {
    labels: {
      invocation: hookCtx.invocation,
      path: hookCtx.path.join(" ")
    },
    requestId: hookCtx.locals.requestId,
    traceId: hookCtx.http?.traceId,
    spanId: hookCtx.http?.spanId
  });
  return { failureKind, clientError, errorMsg: displayMessage };
}

// ../../src/core/respond.ts
function normalizeRespondOptions(opts) {
  if (opts.contentType !== undefined) {
    return opts;
  }
  const body = opts.body;
  if (body instanceof Uint8Array) {
    throw new Error("ctx.respond() with Uint8Array body requires an explicit contentType");
  }
  if (typeof body === "string") {
    return { ...opts, contentType: "text/plain; charset=utf-8" };
  }
  return { ...opts, contentType: "application/json; charset=utf-8" };
}
function writeRespondBodyToStdout(body) {
  if (body instanceof Uint8Array) {
    process.stdout.write(body);
    return;
  }
  if (typeof body === "string") {
    process.stdout.write(body);
    if (!body.endsWith(`
`)) {
      process.stdout.write(`
`);
    }
    return;
  }
  process.stdout.write(`${JSON.stringify(body, null, 2)}
`);
}
function encodeRespondBodyBase64(body) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(body).toString("base64");
  }
  let binary = "";
  for (const byte of body) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// ../../src/mcp/result.ts
function buildToolCallSuccessFromResponse(response) {
  const { body, contentType = "application/json; charset=utf-8" } = response;
  let structuredContent;
  let text = "";
  if (body instanceof Uint8Array) {
    structuredContent = {
      data: encodeRespondBodyBase64(body),
      contentType,
      encoding: "base64"
    };
    text = `[Binary data: ${contentType}, ${body.length} bytes]`;
  } else if (typeof body === "string") {
    structuredContent = {
      content: body,
      contentType
    };
    text = body;
  } else {
    structuredContent = body;
    text = typeof body === "object" && body !== null ? JSON.stringify(body, null, 2) : String(body ?? "");
  }
  return {
    content: [{ type: "text", text }],
    structuredContent,
    isError: false
  };
}

// ../../src/headless/tool-call.ts
function lookupHeadlessTool(program, toolName) {
  const tools = collectMcpTools(program);
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    return { ok: false, kind: "unknown", message: `Unknown tool: ${toolName}` };
  }
  const { resolved } = bootstrapAppConfig(program, { validateFile: false });
  const missingConfig = missingRequiredConfig(program, resolved);
  if (missingConfig.length > 0) {
    return {
      ok: false,
      kind: "missing_config",
      message: formatMcpMissingConfigMessage(program, missingConfig)
    };
  }
  return { ok: true, tool };
}
function invokeFailure(result) {
  const message = result.errorMsg ?? (result.stderr.trim() || `Exit code ${result.exitCode}`);
  return {
    ok: false,
    kind: result.kind === "help" ? "help" : "invoke",
    message,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    failureKind: result.failureKind,
    invokeResult: result
  };
}
function noResponseFailure(result) {
  return {
    ok: false,
    kind: "invoke",
    message: "Handler did not call ctx.respond() or return a value",
    exitCode: 1,
    stdout: result.stdout,
    stderr: result.stderr,
    failureKind: "unexpected",
    invokeResult: result
  };
}
async function executeHeadlessToolCall(cli, tool, args, invocation, mcp) {
  const argvResult = mcpToolCallToArgv(cli.program, tool, args);
  if ("error" in argvResult) {
    return {
      ok: false,
      kind: "argv",
      message: argvResult.error,
      exitCode: 1,
      stdout: "",
      stderr: "",
      failureKind: "validation"
    };
  }
  const invokeResult = await cli.invoke(argvResult, { invocation, toolArgs: args, mcp });
  if (invokeResult.kind === "help") {
    return invokeFailure(invokeResult);
  }
  if (invokeResult.kind === "ok" && invokeResult.exitCode === 0 && invokeResult.response) {
    const mcpResult = buildToolCallSuccessFromResponse(invokeResult.response);
    return {
      ok: true,
      response: invokeResult.response,
      mcpResult
    };
  }
  if (invokeResult.kind === "ok" && invokeResult.exitCode === 0) {
    return noResponseFailure(invokeResult);
  }
  return invokeFailure(invokeResult);
}
async function executeHttpRouteCall(cli, route, pathParams, query, body, http) {
  const argvResult = httpRequestToArgv(cli.program, route, pathParams, query, body);
  if ("error" in argvResult) {
    return {
      ok: false,
      kind: "argv",
      message: argvResult.error,
      exitCode: 1,
      stdout: "",
      stderr: "",
      failureKind: "validation"
    };
  }
  const toolArgs = { ...body, ...query, ...pathParams };
  const invokeResult = await cli.invoke(argvResult, { invocation: "http", toolArgs, http });
  if (invokeResult.kind === "help") {
    return invokeFailure(invokeResult);
  }
  if (invokeResult.kind === "ok" && invokeResult.exitCode === 0 && invokeResult.response) {
    const mcpResult = buildToolCallSuccessFromResponse(invokeResult.response);
    return {
      ok: true,
      response: invokeResult.response,
      mcpResult
    };
  }
  if (invokeResult.kind === "ok" && invokeResult.exitCode === 0) {
    return noResponseFailure(invokeResult);
  }
  return invokeFailure(invokeResult);
}
function headlessSuccessToHttpResponse(result, leafApiResponse, defaultStatus) {
  return apiSuccessResponse(result.response, leafApiResponse, defaultStatus);
}
function headlessFailureToHttpResponse(result, obscureUnexpected = false) {
  const status = resolveHttpErrorStatus(result);
  let message = firstErrorLine(result.message);
  if (obscureUnexpected && result.failureKind === "unexpected") {
    message = obscureUnexpectedClientMessage();
  }
  return apiErrorResponse(status, { error: message });
}
function resolveHttpErrorStatus(result) {
  if (result.failureKind) {
    return failureKindHttpStatus(result.failureKind);
  }
  if (result.kind === "argv" || result.kind === "help") {
    return 400;
  }
  if (result.kind === "invoke" && result.message.includes("ctx.respond()")) {
    return 500;
  }
  if (result.exitCode === 1) {
    return 400;
  }
  return 500;
}
function headlessFailureMcpMessage(result, obscureUnexpected = false) {
  if (obscureUnexpected && result.failureKind === "unexpected") {
    return obscureUnexpectedClientMessage();
  }
  return firstErrorLine(result.message);
}

// ../../src/log/trace.ts
import { randomBytes } from "node:crypto";
var TRACEPARENT_RE = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;
function randomSpanId() {
  return randomBytes(8).toString("hex");
}
function parseTraceparent(header) {
  const match = header.trim().match(TRACEPARENT_RE);
  if (!match) {
    return;
  }
  const [, traceId, spanId, flags] = match;
  if (!traceId || !spanId || !flags) {
    return;
  }
  const flagByte = Number.parseInt(flags, 16);
  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    sampled: (flagByte & 1) === 1
  };
}
function extractTraceContext(request) {
  const parsed = parseTraceparent(request.headers.get("traceparent") ?? "");
  if (!parsed) {
    return;
  }
  return {
    traceId: parsed.traceId,
    parentSpanId: parsed.spanId,
    spanId: randomSpanId(),
    sampled: parsed.sampled
  };
}
function formatTraceparent(ctx) {
  const flags = ctx.sampled === false ? "00" : "01";
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

// ../../src/http/readiness.ts
var READINESS_CACHE_MS = 3000;
function configFileCheck(runtime) {
  const err = runtime.state.configFileError;
  if (typeof err === "string" && err.length > 0) {
    return { ok: false, error: err };
  }
  return { ok: true };
}
function configRequiredCheck(program, appConfig) {
  if (!program.appConfig) {
    return { ok: true };
  }
  const missing = missingRequiredConfig(program, appConfig.read());
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}
async function customReadinessCheck(ctx) {
  const fn = ctx.program.readiness;
  if (!fn) {
    return { ok: true };
  }
  try {
    const ok = await Promise.resolve(fn(ctx));
    return ok ? { ok: true } : { ok: false, error: "readiness check returned false" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
async function evaluateReadiness(program, surface, runtime, appConfig) {
  const cached = runtime.state.readinessCache;
  if (cached && Date.now() - cached.at < READINESS_CACHE_MS) {
    return cached.result;
  }
  const ctx = { program, surface, appConfig, runtime };
  const checks = {
    config_file: configFileCheck(runtime),
    config_required: configRequiredCheck(program, appConfig),
    custom: await customReadinessCheck(ctx)
  };
  const ok = Object.values(checks).every((c) => c.ok);
  const result = { ok, checks };
  runtime.state.readinessCache = { at: Date.now(), result };
  runtime.state.readiness = result;
  return result;
}

// ../../src/http/server.ts
var DEFAULT_HOST = "127.0.0.1";
var DEFAULT_PORT = 3000;
function resolveHttpListenAddress(program) {
  const config = program.httpServer;
  return {
    hostname: config?.host ?? DEFAULT_HOST,
    port: config?.port ?? DEFAULT_PORT
  };
}
function resolveClientIp(request, trustProxy) {
  if (trustProxy) {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      return xff.split(",")[0]?.trim() ?? "unknown";
    }
  }
  return "unknown";
}
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...API_CORS_HEADERS,
      "content-type": "application/json; charset=utf-8"
    }
  });
}
function parseQuery(url) {
  const out = {};
  for (const [k, v] of url.searchParams.entries()) {
    out[k] = v;
  }
  return out;
}
async function handleApiRequest(cli, request, resolved) {
  const httpConfig = resolved ?? cli.server?.http;
  const trustProxy = httpConfig?.trustProxy ?? cli.program.httpServer?.trustProxy ?? false;
  const requestId = randomUUID();
  const url = new URL(request.url);
  const clientIp = resolveClientIp(request, trustProxy);
  const trace = extractTraceContext(request);
  const wireCtx = {
    request,
    requestId,
    clientIp,
    path: url.pathname,
    method: request.method,
    ...trace ? { traceId: trace.traceId, spanId: trace.spanId } : {}
  };
  const hooks = cli.server?.httpHooks ?? cli.program.httpServer?.hooks;
  const emitter = cli.server?.emitter;
  const started = performance.now();
  const finish = async (response, failureKind, error) => {
    const durationMs = Math.round(performance.now() - started);
    if (failureKind && error !== undefined) {
      await hooks?.onError?.({
        ...wireCtx,
        failureKind,
        error
      });
    } else {
      await hooks?.onResponse?.({ ...wireCtx, status: response.status, durationMs });
    }
    emitter?.emitAccess({
      method: request.method,
      path: url.pathname,
      status: response.status,
      durationMs,
      requestId,
      clientIp,
      traceId: trace?.traceId,
      spanId: trace?.spanId
    });
    if (!trace) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set("traceparent", formatTraceparent({ traceId: trace.traceId, spanId: trace.spanId, sampled: trace.sampled }));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
  await hooks?.onRequest?.(wireCtx);
  if (request.method === "OPTIONS") {
    return finish(apiOptionsResponse());
  }
  const root = cli.program;
  const path = url.pathname;
  if (request.method === "GET" && path === "/health/liveness") {
    return finish(jsonResponse(200, { ok: true }));
  }
  if (request.method === "GET" && path === "/health/readiness") {
    const runtime = cli.server?.runtime;
    if (!runtime) {
      return finish(jsonResponse(200, { ok: true }));
    }
    const readiness = await evaluateReadiness(root, "http", runtime, cli.appConfig);
    return finish(jsonResponse(readiness.ok ? 200 : 503, readiness));
  }
  if (request.method === "GET" && path === "/openapi.json") {
    return finish(jsonResponse(200, generateOpenApi(root)));
  }
  if (request.method === "GET" && path === "/swagger") {
    return finish(new Response(apiDocsHtml(), {
      status: 200,
      headers: {
        ...API_CORS_HEADERS,
        "content-type": "text/html; charset=utf-8"
      }
    }));
  }
  if (path.startsWith("/tools")) {
    return finish(apiErrorResponse(404, { error: "Not found" }));
  }
  const match = matchHttpRoute(root, request.method, path);
  if (match.ok) {
    let body = {};
    if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
      const rawBody = await request.text();
      if (rawBody.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawBody);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return finish(apiErrorResponse(400, { error: "Request body must be a JSON object" }));
          }
          body = parsed;
        } catch {
          try {
            const parsed = Bun.YAML.parse(rawBody);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
              return finish(apiErrorResponse(400, { error: "Request body must be a JSON object" }));
            }
            body = parsed;
          } catch {
            return finish(apiErrorResponse(400, { error: "Invalid JSON body" }));
          }
        }
      }
    }
    const query = parseQuery(url);
    const result = await executeHttpRouteCall(cli, match.route, match.pathParams, query, body, {
      request,
      clientIp,
      requestId,
      ...trace ? { traceId: trace.traceId, spanId: trace.spanId } : {}
    });
    if (result.ok) {
      const leafHttp = leafHttpResponseDefaults(match.route.leaf);
      const hasBody = result.response.body !== undefined;
      const methodDefault = match.route.leaf.http?.successStatus ?? defaultSuccessStatus(match.route.method, hasBody && match.route.method !== "DELETE");
      return finish(headlessSuccessToHttpResponse(result, leafHttp, methodDefault));
    }
    const obscure = httpConfig?.obscureUnexpected ?? false;
    return finish(headlessFailureToHttpResponse(result, obscure), result.invokeResult?.failureKind, result.message);
  }
  return finish(apiErrorResponse(404, { error: "Not found" }));
}
async function httpServeHttp(cli, resolved) {
  const listen = resolved ?? {
    hostname: resolveHttpListenAddress(cli.program).hostname,
    port: resolveHttpListenAddress(cli.program).port,
    trustProxy: cli.program.httpServer?.trustProxy ?? false,
    obscureUnexpected: cli.program.httpServer?.errors?.obscureUnexpected ?? false,
    log: { format: "json", access: true, errors: true, dev: false }
  };
  const server = Bun.serve({
    hostname: listen.hostname,
    port: listen.port,
    fetch: (request) => handleApiRequest(cli, request, listen)
  });
  const url = `http://${server.hostname}:${server.port}`;
  const emitter = cli.server?.emitter;
  if (emitter && listen.log.format === "text") {
    emitter.emitLifecycle(`${cli.program.key} ${cli.program.version} — HTTP API listening on ${url}`, "http.server.start");
  } else {
    emitter?.emit({
      level: "info",
      message: `HTTP API listening on ${url}`,
      action: "http.server.start",
      labels: { url }
    });
    if (!emitter) {
      process.stderr.write(`HTTP API listening on ${url}
`);
    }
  }
  await new Promise(() => {});
  throw new Error("HTTP API server stopped unexpectedly");
}

// ../../src/docs/http-guide.ts
function formatRouteLine(root, route) {
  const cliPath = route.commandPath.join(" ");
  let line = `- \`${route.method} ${route.openApiPath}\` (CLI: \`${root.key} ${cliPath}\`) — ${route.leaf.description}`;
  const opts = leafWireOptions(route.leaf);
  const flags = opts.filter((o) => o.kind === "presence" /* Presence */).map((o) => `--${o.name}`);
  if (flags.length > 0) {
    line += ` (flags: ${flags.join(", ")})`;
  }
  return line;
}
function generateHttpGuide(root) {
  const api = root.httpServer;
  if (!api) {
    throw new Error("HTTP API server not enabled");
  }
  const routes = collectHttpRoutes(root);
  const { hostname, port } = resolveHttpListenAddress(root);
  const baseUrl = `http://${hostname}:${port}`;
  const pathPrefix = resolveHttpPathPrefix(root);
  const userGlob = httpUserPathGlob(pathPrefix);
  const sampleWorkspaces = `${pathPrefix}/workspaces`;
  const lines = [
    `# HTTP API (${root.key})`,
    "",
    `${root.key} exposes user commands over HTTP REST routes derived from the CLI tree.`,
    "",
    "## Running",
    "",
    "```bash",
    `${root.key} http`,
    "```",
    "",
    `Listens on **${baseUrl}** by default (\`httpServer.host\` / \`httpServer.port\`).`,
    "",
    "Bind is localhost-only by default — use a reverse proxy for remote access.",
    "",
    "## Endpoints",
    "",
    "| Method | Path | Purpose |",
    "| --- | --- | --- |",
    "| `GET` | `/health/liveness` | Liveness — server is online and accepting requests |",
    "| `GET` | `/health/readiness` | Readiness — online plus config and `program.readiness` checks passed |",
    "| `GET` | `/openapi.json` | OpenAPI 3.1 REST paths |",
    "| `GET` | `/swagger` | Interactive Swagger UI API reference |",
    `| * | \`${userGlob}\` | Invoke user commands (method per route) |`,
    "| `OPTIONS` | `*` | CORS preflight |",
    "",
    `Discover paths from \`openapi.json\` (\`${userGlob}\`). Query binds options; POST/PUT/PATCH body binds options and \`inputSchema\` fields.`,
    "",
    "## Examples",
    "",
    "```bash",
    `curl -s ${baseUrl}/health/liveness`,
    `curl -s ${baseUrl}/health/readiness`,
    `curl -s ${baseUrl}/openapi.json`,
    `curl -s ${baseUrl}${sampleWorkspaces}`,
    `curl -s -X POST ${baseUrl}${sampleWorkspaces} \\`,
    '  -H "content-type: application/json" \\',
    `  -d '{"name":"qa2"}'`,
    "```",
    "",
    "## Responses",
    "",
    "Success: status from handler → `http.successStatus` → method default (GET 200, POST 201, DELETE 204).",
    "",
    "Handlers must use `ctx.respond()` or return a value for API/MCP tool calls.",
    "",
    'Errors use `{ "error": "..." }` with `400`, `404`, `503`, or `500`.',
    "",
    "## Logging",
    "",
    "Server logs go to **stderr** (one JSON object per line by default).",
    "",
    "- Configure with `program.log` on the program root",
    "- **`enrich`** — add custom JSON fields on top of the default line",
    "- **`serialize`** — replace the formatter and emit your own line shape",
    "",
    "See the argsbarg [logging guide](https://github.com/bdombro/bun-argsbarg/blob/main/docs/logging.md) for examples and the full `LogEnrichContext` shape.",
    ""
  ];
  if (root.appConfig?.entries && Object.keys(root.appConfig.entries).length > 0) {
    lines.push("## Configuration", "");
    lines.push(`Configure before first use: \`${root.key} configure\`.`, "", `Default config file: \`${displayAppConfigPath(root)}\`.`, "");
    for (const [key, entry] of Object.entries(root.appConfig.entries)) {
      const label = entry.title ?? defaultConfigEntryTitle(key);
      const req = entry.required === false ? "optional" : "required";
      const envNote = entry.env ? ` → env \`${entry.env}\`` : "";
      lines.push(`- **${label}** (\`${key}\`, ${req}${envNote}) — ${entry.description}`);
    }
    lines.push("");
  }
  lines.push("## REST routes", "");
  if (routes.length === 0) {
    lines.push("(No routes exposed.)", "");
  } else {
    for (const route of routes) {
      lines.push(formatRouteLine(root, route));
    }
    lines.push("");
  }
  lines.push("## Request bodies", "", "POST/PUT/PATCH bodies are a flat JSON object keyed by long option and positional names (hyphenated option names are valid keys).", "", `For HTTP clients, use **\`GET /openapi.json\`** (or **\`GET /swagger\`**) for per-route request shapes.`, "", "Varargs positionals accept a JSON array of strings (not a comma-separated string).", "Options with `format: comma-list` accept a comma-separated string or JSON array.", "Options with a schema `default` are applied when omitted.", "", `Shell invocation reference: \`${root.key} docs cli\`. Full CLI tree JSON: \`${root.key} docs cli-schema\`.`, "", "## OpenAPI", "", "The HTTP API is described in OpenAPI 3.1.", "", `- **Browse** — [${baseUrl}/swagger](${baseUrl}/swagger) (Swagger UI; loads \`/openapi.json\`)`, `- **Fetch** — \`curl -s ${baseUrl}/openapi.json\``, `- **Save offline** — \`${root.key} docs openapi --save\` → \`./docs/openapi.json\` (or \`just docgen\` in app repos)`, "", `Use the spec to discover REST paths and request/response shapes before calling \`${userGlob}\`.`, "");
  return lines.join(`
`);
}

// ../../src/configure/artifacts/mcp-config.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, writeFileSync } from "node:fs";
import { dirname as dirname2 } from "node:path";

// ../../src/paths/host.ts
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
function userHome() {
  const user = process.env.USER ?? process.env.LOGNAME;
  return [process.env.TEST_USER_HOME, user && `/Users/${user}`, user && `/home/${user}`, process.env.USERPROFILE].find((p) => p && existsSync(p)) ?? userInfo().homedir;
}
function displayHomePath(absolutePath, home = userHome()) {
  if (home.length > 0 && absolutePath.startsWith(home)) {
    return `~${absolutePath.slice(home.length)}`;
  }
  return absolutePath;
}
function xdgConfigHome(home = userHome()) {
  return process.env.XDG_CONFIG_HOME ?? join(home, ".config");
}
function appConfigLibHome(home = userHome()) {
  return join(home, ".local", "lib");
}

// ../../src/configure/artifacts/mcp-config.ts
function expectedMcpEntry(root) {
  return { command: root.key, args: ["mcp"] };
}
function entriesEqual(a, b) {
  return a.command === b.command && JSON.stringify(a.args) === JSON.stringify(b.args);
}
function readMcpServerEntry(path, name) {
  if (!existsSync2(path))
    return;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data.mcpServers?.[name];
  } catch {
    return;
  }
}
function installMcpServerEntry(path, name, entry) {
  const existing = readMcpServerEntry(path, name);
  if (existing) {
    if (entriesEqual(existing, entry)) {
      return "skipped-match";
    }
    process.stderr.write(`MCP server "${name}" in ${displayHomePath(path)} differs; leaving existing entry unchanged.
`);
    return "skipped-conflict";
  }
  mergeMcpConfig(path, name, entry, false);
  return "installed";
}
function mergeMcpConfig(path, name, entry, dry) {
  if (dry)
    return;
  let data = {};
  if (existsSync2(path)) {
    data = JSON.parse(readFileSync(path, "utf8"));
  }
  const servers = data.mcpServers ?? {};
  servers[name] = entry;
  data.mcpServers = servers;
  mkdirSync2(dirname2(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}
`, "utf8");
}
function removeMcpConfig(path, name, dry) {
  if (dry || !existsSync2(path))
    return [];
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!data.mcpServers?.[name])
    return [];
  delete data.mcpServers[name];
  writeFileSync(path, `${JSON.stringify(data, null, 2)}
`, "utf8");
  return [path];
}

// ../../src/configure/artifacts/paths.ts
import { dirname as dirname3, join as join2 } from "node:path";

// ../../src/skill/naming.ts
function skillDirName(programKey) {
  return programKey.replace(/[/\\\s]/g, "_");
}

// ../../src/configure/artifacts/paths.ts
function displayInstallPath(path) {
  return displayHomePath(path);
}
function resolveClaudeDesktopMcpPath(home) {
  if (process.platform === "darwin") {
    return join2(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join2(home, "AppData", "Roaming");
    return join2(appData, "Claude", "claude_desktop_config.json");
  }
  return join2(xdgConfigHome(home), "Claude", "claude_desktop_config.json");
}
function resolveInstallPaths(root) {
  const home = userHome();
  const dirName = skillDirName(root.key);
  return {
    agentsSkillDir: join2(home, ".agents", "skills", dirName),
    agentsMcpPath: join2(home, ".agents", "mcp.json"),
    mcpName: mcpServerId(root),
    skillDirName: dirName
  };
}

// ../../src/docs/mcp-resources.ts
function defaultDocsTopicResourceUri(mcpId, topicKey) {
  return `${mcpId}://docs/${topicKey}`;
}
function mcpIdFromProgram(program) {
  return program.key.replace(/[^a-zA-Z0-9]/g, "_");
}
function resolveDocsTopicResourceUri(program, topicKey) {
  return defaultDocsTopicResourceUri(mcpIdFromProgram(program), topicKey);
}
function docsMcpResources(program) {
  if (!docsEnabled(program) || program.mcpServer?.enabled !== true) {
    return [];
  }
  const docs = resolveDocsConfig(program);
  const topics = docs.topics ?? {};
  return docsUserTopicKeys(docs).map((key) => {
    const topic = topics[key];
    if (!topic) {
      throw new Error(`docs topic missing: ${key}`);
    }
    return {
      uri: resolveDocsTopicResourceUri(program, key),
      name: key,
      description: docsTopicDescription(key, topic.description),
      mimeType: "text/markdown",
      load: () => {
        const text = docsTopicText(program, key);
        return text.endsWith(`
`) ? text : `${text}
`;
      }
    };
  });
}
function reservedDocsTopicResourceUris(program) {
  if (!docsEnabled(program) || program.mcpServer?.enabled !== true) {
    return [];
  }
  const docs = resolveDocsConfig(program);
  return docsUserTopicKeys(docs).map((key) => resolveDocsTopicResourceUri(program, key));
}

// ../../src/docs/mcp-guide.ts
function appendManualClientSetup(lines, _root, serverId, entry) {
  const home = userHome();
  const claudeDesktopPath = resolveClaudeDesktopMcpPath(home);
  const mcpServersJson = JSON.stringify({ mcpServers: { [serverId]: entry } }, null, 2);
  lines.push("### Manual client setup", "", "Many clients do not read `~/.agents/mcp.json` yet. Copy the `mcpServers` entry from that file, or paste:", "", "```json", mcpServersJson, "```", "", "| Client | Config file |", "| --- | --- |", "| **Cursor** | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project) |", "| **Claude Code** | `~/.claude.json` under `mcpServers`, or project `.mcp.json` |", "| **Claude Desktop** | See platform paths below |", "", "Restart Cursor or reload MCP after editing. Restart Claude Desktop after config changes.", "", "Claude Desktop config paths:", "", "- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`", "- **Windows:** `%APPDATA%\\Claude\\claude_desktop_config.json`", "- **Linux:** `~/.config/Claude/claude_desktop_config.json`", "", `On this machine (macOS/Linux): \`${claudeDesktopPath}\``, "");
}
function formatToolLine(root, tool) {
  const cliPath = tool.path.length > 0 ? `${root.key} ${tool.path.join(" ")}` : root.key;
  let line = `- \`${cliPath}\` — ${tool.description}`;
  const opts = leafWireOptions(tool.leaf);
  const flags = opts.filter((o) => o.kind === "presence" /* Presence */).map((o) => `--${o.name}`);
  if (flags.length > 0) {
    line += ` (flags: ${flags.join(", ")})`;
  }
  return line;
}
function generateMcpGuide(root) {
  const tools = collectMcpTools(root);
  const schemaUri = resolveMcpSchemaUri(root);
  const serverId = mcpServerId(root);
  const mcp = root.mcpServer;
  if (!mcp) {
    throw new Error("MCP server not enabled");
  }
  const caps = resolveCapabilities(root);
  const entry = expectedMcpEntry(root);
  const lines = [
    `# MCP server (${root.key})`,
    "",
    `${root.key} exposes an MCP server with features similar to the CLI.`,
    "",
    "## Installation",
    "",
    "### `.agents` auto-install",
    "",
    "When `mcpServer.enabled` is set, `configure install` merges this server into `~/.agents/mcp.json` per the https://dotagentsprotocol.com.",
    ""
  ];
  if (caps.configure) {
    lines.push(`Install the CLI first so \`${root.key}\` is on your PATH (e.g. \`brew install ${root.key}\`).`, "");
  } else {
    lines.push(`The CLI binary \`${root.key}\` must already be on your PATH.`, "");
  }
  lines.push("```bash", `${root.key} configure install`, "```", "", "Writes or updates `~/.agents/mcp.json` with a `mcpServers` entry for this app.", "");
  appendManualClientSetup(lines, root, serverId, entry);
  lines.push("### Manual `mcpServers` entry", "", "Same shape as in `~/.agents/mcp.json`:", "", "```json", JSON.stringify({
    mcpServers: {
      [serverId]: entry
    }
  }, null, 2), "```", "", "## Running directly", "", "Start the stdio MCP server without editing host config:", "", "```bash", `${root.key} mcp`, "```", "");
  lines.push("## Environment", "", "- **`shellEnv`** — on by default; captures login-shell environment at MCP startup (PATH, toolchain shims, exports). Opt out with `shellEnv: false`.", "");
  if (root.appConfig?.entries && Object.keys(root.appConfig.entries).length > 0) {
    lines.push("## Configuration", "");
    lines.push(`Configure before first use in Cursor or Claude Desktop (MCP hosts are non-interactive): \`${root.key} configure\`.`, "", `Default config file: \`${displayAppConfigPath(root)}\` (flat JSON keys).`, "");
    for (const [key, entryConfig] of Object.entries(root.appConfig.entries)) {
      const label = entryConfig.title ?? defaultConfigEntryTitle(key);
      const req = entryConfig.required === false ? "optional" : "required";
      const envNote = entryConfig.env ? ` → env \`${entryConfig.env}\`` : "";
      lines.push(`- **${label}** (\`${key}\`, ${req}${envNote}) — ${entryConfig.description}`);
    }
    lines.push("", "Example:", "", "```typescript", "config: {", "  schema: {", '    apiToken: { description: "…", env: "API_TOKEN", sensitive: true },', "  },", "},", "```", "");
  }
  lines.push("## What agents get", "", "| Mechanism | Purpose |", "|-----------|---------|", "| `tools/list` | Callable tools for exposed leaf commands |", "| `tools/call` | Runs handlers headlessly; JSON stdout becomes `structuredContent` when valid |", `| Schema resource | \`${schemaUri}\` — same JSON as \`${root.key} docs cli-schema\` |`);
  if (docsEnabled(root)) {
    const docs = resolveDocsConfig(root);
    for (const key of docsUserTopicKeys(docs)) {
      const uri2 = resolveDocsTopicResourceUri(root, key);
      lines.push(`| Docs topic \`${key}\` | \`${uri2}\` — same markdown as \`${root.key} docs ${key}\` |`);
    }
  }
  lines.push("", "## Exposed tools", "");
  if (tools.length === 0) {
    lines.push("(No MCP tools exposed.)", "");
  } else {
    for (const tool of tools) {
      lines.push(formatToolLine(root, tool));
    }
    lines.push("");
  }
  lines.push("## Tool arguments", "", "Arguments are a flat JSON object keyed by long option and positional names (hyphenated option names are valid keys).", `See \`${root.key} docs cli-schema\` or the schema resource for per-tool shapes.`, "", "Varargs positionals accept a JSON array of strings (not a comma-separated string).", "Options with `format: comma-list` accept a comma-separated string or JSON array.", "Options with a schema `default` are applied when omitted.", "", "## Protocol", "", "Stdio NDJSON JSON-RPC. Help and `docs cli-schema` are not available through tool calls.", `Run \`${root.key} docs\` for bundled user documentation.`, "");
  return lines.join(`
`);
}

// ../../src/docs/resolve.ts
var DOCS_BUILTIN_TOPIC_KEYS = ["http", "mcp", "all", "cli-schema", "cli", "openapi"];
var DOCS_ROUTER_DESCRIPTION = "Print bundled CLI documentation.";
function docsEnabled(program) {
  return program.docs?.enabled !== false;
}
function resolveDocsConfig(program) {
  return {
    description: program.docs?.description,
    topics: program.docs?.topics ?? {}
  };
}
function docsUserTopicKeys(docs) {
  return Object.keys(docs.topics ?? {});
}
function docsIncludesMcpTopic(program) {
  return docsEnabled(program) && program.mcpServer?.enabled === true;
}
function docsIncludesHttpTopic(program) {
  return docsEnabled(program) && program.httpServer?.enabled === true;
}
function docsIncludesOpenApiTopic(program) {
  return docsIncludesHttpTopic(program);
}
function docsTopicDescription(key, custom) {
  if (custom) {
    return custom;
  }
  if (key === "readme") {
    return "Print README (user guide).";
  }
  const label = key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `Print ${label} documentation.`;
}
function docsTopicText(program, topic) {
  if (!docsEnabled(program)) {
    throw new Error("docs not enabled");
  }
  if (topic === "mcp") {
    if (!docsIncludesMcpTopic(program)) {
      throw new Error("Unknown docs topic 'mcp'.");
    }
    return generateMcpGuide(program);
  }
  if (topic === "http") {
    if (!docsIncludesHttpTopic(program)) {
      throw new Error("Unknown docs topic 'http'.");
    }
    return generateHttpGuide(program);
  }
  const topics = program.docs?.topics ?? {};
  const entry = topics[topic];
  if (!entry) {
    throw new Error(`Unknown docs topic '${topic}'.`);
  }
  return entry.text;
}
function docsTopicContent(program, topic) {
  if (topic === "cli-schema") {
    return cliSchemaJson(program);
  }
  if (topic === "openapi") {
    if (!docsIncludesOpenApiTopic(program)) {
      throw new Error("Unknown docs topic 'openapi'.");
    }
    return openApiJson(program);
  }
  if (topic === "cli") {
    return generateCliGuide(program);
  }
  const text = docsTopicText(program, topic);
  return text.endsWith(`
`) ? text : `${text}
`;
}
function printDocsTopic(program, topic) {
  process.stdout.write(docsTopicContent(program, topic));
}

// ../../src/docs/save.ts
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname4, join as join3 } from "node:path";

// ../../src/skill/hint.ts
var MARKDOWN_FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
function generatedFileHtmlComment(source) {
  return `<!-- Generated by ${source}; do not edit. -->

`;
}
function insertGeneratedHint(content, hint, options) {
  if (options?.afterFrontmatter) {
    const match = content.match(MARKDOWN_FRONTMATTER_RE);
    if (match) {
      return `${match[0]}${hint}${content.slice(match[0].length)}`;
    }
  }
  return `${hint}${content}`;
}
function skillBundleHint(program) {
  return generatedFileHtmlComment(`${program.key} mcp bundle`);
}
function applyPluginSkillHint(program, skillMd) {
  return insertGeneratedHint(skillMd, skillBundleHint(program), { afterFrontmatter: true });
}

// ../../src/docs/save.ts
var DOCS_SAVE_DIR = "docs";
var DOCS_GENERATED_SAVE_TOPICS = ["mcp", "cli", "http"];
function docsTopicIsGeneratedByArgsbarg(topic) {
  return DOCS_GENERATED_SAVE_TOPICS.includes(topic);
}
function docsSaveGeneratedHint(program, topic) {
  return generatedFileHtmlComment(`${program.key} docs ${topic} --save`);
}
function applySaveGeneratedHint(program, topic, content) {
  if (!docsTopicIsGeneratedByArgsbarg(topic)) {
    return content;
  }
  const hint = docsSaveGeneratedHint(program, topic);
  return insertGeneratedHint(content, hint);
}
function docsTopicContentForSave(program, topic) {
  return applySaveGeneratedHint(program, topic, docsTopicContent(program, topic));
}
function docsSaveFilename(topic) {
  if (topic === "cli-schema") {
    return "cli-schema.json";
  }
  if (topic === "openapi") {
    return "openapi.json";
  }
  return `${topic}.md`;
}
function docsSaveRelativePath(topic, _program) {
  return join3(DOCS_SAVE_DIR, docsSaveFilename(topic));
}
function saveDocsTopic(program, topic) {
  const rel = docsSaveRelativePath(topic, program);
  const abs = join3(process.cwd(), rel);
  mkdirSync3(dirname4(abs), { recursive: true });
  writeFileSync2(abs, docsTopicContentForSave(program, topic), "utf8");
  return rel;
}

// ../../src/docs/builtin.ts
var DOCS_SAVE_OPTION = {
  name: "save",
  description: "Write documentation to ./docs/.",
  kind: "presence" /* Presence */
};
function runDocsTopic(program, topic, ctx) {
  if (ctx.hasFlag("save")) {
    process.stdout.write(`${saveDocsTopic(program, topic)}
`);
    return;
  }
  printDocsTopic(program, topic);
}
function docsLeaf(program, key, description) {
  return {
    key,
    description,
    options: [DOCS_SAVE_OPTION],
    mcpTool: { enabled: false },
    handler: (ctx) => {
      runDocsTopic(program, key, ctx);
    }
  };
}
function docsRouterNotes() {
  return "Topics print to stdout. Add --save to write files under ./docs/.";
}
function cliBuiltinDocsGroup(program) {
  const docs = resolveDocsConfig(program);
  const topics = docs.topics ?? {};
  const leaves = [];
  for (const key of docsUserTopicKeys(docs)) {
    const topic = topics[key];
    if (!topic) {
      throw new Error(`docs topic missing: ${key}`);
    }
    leaves.push(docsLeaf(program, key, docsTopicDescription(key, topic.description)));
  }
  if (docsIncludesMcpTopic(program)) {
    leaves.push(docsLeaf(program, "mcp", "Print MCP server setup and tool guidance."));
  }
  if (docsIncludesHttpTopic(program)) {
    leaves.push(docsLeaf(program, "http", "Print HTTP API setup and tool guidance."));
  }
  if (docsIncludesOpenApiTopic(program)) {
    leaves.push(docsLeaf(program, "openapi", "Print the HTTP OpenAPI 3.1 document as JSON."));
  }
  leaves.push(docsLeaf(program, "cli-schema", "Print the full CLI command tree as JSON."), docsLeaf(program, "cli", "Print the full command reference as markdown."));
  return {
    key: "docs",
    description: docs.description ?? DOCS_ROUTER_DESCRIPTION,
    notes: docsRouterNotes(),
    options: [DOCS_SAVE_OPTION],
    commands: leaves
  };
}
function cliBuiltinDocsGroupIfEnabled(program) {
  if (!docsEnabled(program)) {
    return null;
  }
  return cliBuiltinDocsGroup(program);
}

// ../../src/builtins/completion-group.ts
function cliBuiltinCompletionGroup(program) {
  const appName = program.key;
  const router = {
    key: "completion",
    cli: { hidden: true },
    description: "Generate the autocompletion script for shells.",
    commands: [
      {
        key: "bash",
        description: "Print a bash tab-completion script.",
        notes: "Homebrew installs completions during `brew install` via generate_completions_from_executable.\n\n" + `Ensure your shell loads Homebrew completions:
` + `  https://docs.brew.sh/Shell-Completion

` + `Try this session only:

` + `  source <(${appName} completion bash)`,
        handler: () => {}
      },
      {
        key: "zsh",
        description: "Print a zsh tab-completion script.",
        notes: `Homebrew installs completions to $(brew --prefix)/share/zsh/site-functions.

` + `Ensure brew shellenv + compinit are configured:
` + `  https://docs.brew.sh/Shell-Completion

` + `Try this session only:

` + `  eval "$(${appName} completion zsh)"`,
        handler: () => {}
      },
      {
        key: "fish",
        description: "Print a fish tab-completion script.",
        notes: `Homebrew installs completions to $(brew --prefix)/share/fish/vendor_completions.d.

` + `See: https://docs.brew.sh/Shell-Completion

` + `Try this session only:

` + `  ${appName} completion fish | source`,
        handler: () => {}
      }
    ]
  };
  router.notes = `Completions are installed by Homebrew during formula install.

` + "See: https://docs.brew.sh/Shell-Completion";
  return router;
}

// ../../src/configure/artifacts/target-base.ts
class InstallTarget {
  defaultIncludedInAll() {
    return false;
  }
  applyDetected(_paths, _root, _out) {}
  detectedForSnapshot(detected) {
    return this.isDetectedFromSnapshot(detected);
  }
  statusLine(paths, root, detected) {
    if (!this.isDetectedFromInstalled(detected))
      return;
    return this.formatStatusLine(paths, root);
  }
  isDetectedFromInstalled(detected) {
    return this.isDetectedFromSnapshot(detected);
  }
  planInstall(ctx) {
    if (!ctx.include(this.key))
      return [];
    return this.buildInstallActions(ctx);
  }
  planUninstall(ctx) {
    if (!ctx.include(this.key))
      return [];
    if (!this.isDetectedFromSnapshot(ctx.detected))
      return [];
    return this.buildUninstallActions(ctx);
  }
  contributeStatus(paths, root, detected, status) {
    const line = this.statusLine(paths, root, detected);
    if (!line)
      return;
    this.assignStatusLine(status, line);
  }
}

// ../../src/configure/artifacts/target-mcp-json.ts
function mcpConfigHasServer(path, name) {
  return readMcpServerEntry(path, name) !== undefined;
}

class McpJsonInstallTarget extends InstallTarget {
  key;
  actionKind;
  category = "mcp";
  spec;
  constructor(spec) {
    super();
    this.spec = spec;
    this.key = spec.key;
    this.actionKind = spec.actionKind;
  }
  isAvailable(root, paths) {
    return this.spec.isAvailable(root, paths);
  }
  isDetected(paths, _root) {
    return mcpConfigHasServer(this.spec.configPath(paths), paths.mcpName);
  }
  applyDetected(paths, root, out) {
    out[this.spec.detectedKey] = this.isDetected(paths, root);
  }
  isDetectedFromSnapshot(detected) {
    return detected[this.spec.detectedKey];
  }
  formatStatusLine(paths, _root) {
    const path = displayInstallPath(this.spec.configPath(paths));
    if (this.spec.statusIncludesServer) {
      return `${path} (server "${paths.mcpName}")`;
    }
    return path;
  }
  assignStatusLine(status, line) {
    status[this.spec.statusField] = line;
  }
  preflight(_ctx) {
    return null;
  }
  buildInstallActions(ctx) {
    const configPath = this.spec.configPath(ctx.paths);
    const entry = expectedMcpEntry(ctx.root);
    const displayPath = displayInstallPath(configPath);
    return [
      {
        kind: this.actionKind,
        summary: `${this.spec.label}: ${displayPath}`,
        message: `Merging MCP server "${ctx.paths.mcpName}" into ${displayPath}`,
        run: () => {
          const result = installMcpServerEntry(configPath, ctx.paths.mcpName, entry);
          if (result === "installed") {
            process.stdout.write(`Registered MCP server in ${displayPath}
`);
          }
          return result === "installed" ? [configPath] : [];
        }
      }
    ];
  }
  buildUninstallActions(ctx) {
    const configPath = this.spec.configPath(ctx.paths);
    const displayPath = displayInstallPath(configPath);
    return [
      {
        kind: this.actionKind,
        summary: `${this.spec.label}: ${displayPath}`,
        message: `Removing MCP server "${ctx.paths.mcpName}" from ${displayPath}`,
        run: () => {
          const changed = removeMcpConfig(configPath, ctx.paths.mcpName, ctx.dry);
          if (changed.length > 0 && !ctx.dry) {
            process.stdout.write(`Removed MCP server from ${displayPath}
`);
          }
          return changed;
        }
      }
    ];
  }
}

// ../../src/configure/artifacts/targets/agents-mcp.ts
var agentsMcpTarget = new McpJsonInstallTarget({
  key: "agentsMcp",
  actionKind: "agents-mcp",
  label: "agents mcp",
  configPath: (p) => p.agentsMcpPath,
  detectedKey: "agentsMcp",
  statusField: "agentsMcp",
  isAvailable: (root) => root.mcpServer?.enabled === true
});

// ../../src/configure/artifacts/binary-placement.ts
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, join as join4 } from "node:path";
function resolvePathCommand(key) {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir)
      continue;
    const candidate = join4(dir, key);
    try {
      accessSync(candidate, constants.F_OK);
      return realpathSync(candidate);
    } catch {}
  }
  const found = Bun.which(key);
  if (found === null)
    return;
  try {
    return realpathSync(found);
  } catch {
    return found;
  }
}
function realpathOrSelf(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
function isExternallyManagedBinary(key, execPath = process.execPath) {
  const resolved = resolvePathCommand(key);
  if (!resolved)
    return false;
  return resolved === realpathOrSelf(execPath);
}

// ../../src/configure/artifacts/targets/app.ts
class AppInstallTarget extends InstallTarget {
  key = "app";
  actionKind = "app";
  category = "core";
  defaultIncludedInAll() {
    return false;
  }
  isAvailable(_root, _paths) {
    return true;
  }
  isDetected(_paths, root) {
    return isExternallyManagedBinary(root.key) || false;
  }
  applyDetected(_paths, root, out) {
    out.app = isExternallyManagedBinary(root.key);
  }
  isDetectedFromSnapshot(detected) {
    return detected.app;
  }
  formatStatusLine(_paths, root) {
    if (isExternallyManagedBinary(root.key)) {
      return "system (PATH)";
    }
    return "not installed (use Homebrew)";
  }
  assignStatusLine(status, line) {
    status.app = line;
  }
  buildInstallActions(_ctx) {
    return [];
  }
  buildUninstallActions(_ctx) {
    return [];
  }
}
var appTarget = new AppInstallTarget;

// ../../src/configure/artifacts/targets/configure.ts
class ConfigureInstallTarget extends InstallTarget {
  key = "configure";
  actionKind = "configure";
  category = "core";
  isAvailable(_root, _paths) {
    return true;
  }
  isDetected(_paths, root) {
    return appConfigInstalled(root);
  }
  applyDetected(_paths, _root, _out) {}
  isDetectedFromSnapshot(detected) {
    return detected.appConfig ?? false;
  }
  formatStatusLine(_paths, root) {
    return displayAppConfigPath(root);
  }
  assignStatusLine(_status, _line) {}
  buildInstallActions(_ctx) {
    return [];
  }
  buildUninstallActions(ctx) {
    return [
      {
        kind: "configure",
        summary: `app config: ${displayAppConfigPath(ctx.root)}`,
        message: `Removing app config ${displayAppConfigPath(ctx.root)}`,
        run: () => uninstallAppConfig(ctx.root, ctx.dry)
      }
    ];
  }
}
var configureTarget = new ConfigureInstallTarget;

// ../../src/configure/artifacts/targets/skill.ts
import { existsSync as existsSync5 } from "node:fs";

// ../../src/configure/artifacts/target-skill.ts
import { existsSync as existsSync4 } from "node:fs";

// ../../src/configure/artifacts/uninstall.ts
import { existsSync as existsSync3, rmSync } from "node:fs";
function buildUninstallPlan(root, paths, opts) {
  return buildUninstallPlanFromTargets(root, paths, opts);
}
function uninstallSkillDir(dir, dry) {
  if (!existsSync3(dir))
    return [];
  if (!dry) {
    rmSync(dir, { recursive: true, force: true });
    process.stdout.write(`Removed skill from ${displayHomePath(dir)}/
`);
  }
  return [`${dir}/`];
}

// ../../src/configure/artifacts/target-skill.ts
class SkillInstallTarget extends InstallTarget {
  key;
  actionKind;
  category = "skill";
  uninstallPrefix;
  spec;
  constructor(spec) {
    super();
    this.spec = spec;
    this.key = spec.key;
    this.actionKind = spec.actionKind;
    this.uninstallPrefix = spec.uninstallPrefix;
  }
  isAvailable(root, paths) {
    return this.spec.isAvailable(root, paths);
  }
  isDetected(paths, _root) {
    return existsSync4(this.spec.skillDir(paths));
  }
  applyDetected(paths, root, out) {
    out[this.spec.detectedKey] = this.isDetected(paths, root);
  }
  isDetectedFromSnapshot(detected) {
    return detected[this.spec.detectedKey];
  }
  formatStatusLine(paths, _root) {
    return `${displayInstallPath(this.spec.skillDir(paths))}/`;
  }
  assignStatusLine(status, line) {
    status[this.spec.statusField] = line;
  }
  skillDir(paths) {
    return this.spec.skillDir(paths);
  }
  buildInstallActions(_ctx) {
    return [];
  }
  buildUninstallActions(ctx) {
    const dir = this.spec.skillDir(ctx.paths);
    return [
      {
        kind: this.actionKind,
        summary: `${this.uninstallPrefix}: ${displayInstallPath(dir)}/`,
        message: `Removing ${this.spec.label.toLowerCase()} ${displayInstallPath(dir)}/`,
        run: () => uninstallSkillDir(dir, ctx.dry)
      }
    ];
  }
}

// ../../src/configure/artifacts/targets/skill.ts
var skillTarget = new SkillInstallTarget({
  key: "skill",
  actionKind: "agent-skill",
  label: "Agent skill",
  uninstallPrefix: "agent skill",
  skillDir: (p) => p.agentsSkillDir,
  detectedKey: "skill",
  statusField: "skill",
  isAvailable: (_root, p) => existsSync5(p.agentsSkillDir)
});

// ../../src/configure/artifacts/targets/index.ts
var INSTALL_TARGETS = [appTarget, skillTarget, agentsMcpTarget, configureTarget];

// ../../src/configure/artifacts/target-registry.ts
var INSTALL_ARTIFACT_KEYS = INSTALL_TARGETS.map((t) => t.key);
var SKILL_KEYS = INSTALL_TARGETS.filter((t) => t.category === "skill").map((t) => t.key);
var MCP_KEYS = INSTALL_TARGETS.filter((t) => t.category === "mcp").map((t) => t.key);
var ACTION_KIND_TO_ARTIFACT = Object.fromEntries(INSTALL_TARGETS.map((t) => [t.actionKind, t.key]));
var targetByKey = new Map(INSTALL_TARGETS.map((t) => [t.key, t]));
function installTargetForKey(key) {
  return targetByKey.get(key);
}
function isMcpArtifactKey(key) {
  return installTargetForKey(key)?.category === "mcp";
}
function mcpServerRequiredForArtifact(key, mcpServerEnabled) {
  return !isMcpArtifactKey(key) || mcpServerEnabled;
}

// ../../src/configure/artifacts/target-effective.ts
function resolveInstallTargetSpec(spec, defaults) {
  if (spec === undefined) {
    return { ...defaults };
  }
  if (typeof spec === "boolean") {
    return {
      enabled: spec,
      includedInAll: spec ? defaults.includedInAll : false
    };
  }
  return {
    enabled: spec.enabled ?? defaults.enabled,
    includedInAll: spec.includedInAll ?? defaults.includedInAll
  };
}
function artifactDefaults(key, program) {
  if (key === "skill") {
    return { enabled: false, includedInAll: false };
  }
  if (key === "agentsMcp") {
    const on = program?.mcpServer?.enabled === true;
    return { enabled: on, includedInAll: on };
  }
  const target = installTargetForKey(key);
  if (!mcpServerRequiredForArtifact(key, program?.mcpServer?.enabled === true)) {
    return { enabled: false, includedInAll: false };
  }
  return { enabled: true, includedInAll: target?.defaultIncludedInAll() ?? false };
}
function resolveEffectiveInstallTargets(configure, program) {
  const user = configure?.targets;
  const out = {};
  for (const key of INSTALL_ARTIFACT_KEYS) {
    const userSpec = key === "skill" || key === "agentsMcp" ? undefined : user?.[key];
    out[key] = resolveInstallTargetSpec(userSpec, artifactDefaults(key, program));
  }
  return out;
}
function mcpCategoryEnabled(root) {
  return resolveCapabilities(root).mcp;
}
function resolveInstallPlanMode(opts) {
  if (opts.reinstall)
    return "refresh";
  if (opts.uninstall)
    return opts.all ? "uninstall-all" : "uninstall-scoped";
  if (opts.all)
    return "install-all";
  return "install-scoped";
}

// ../../src/configure/artifacts/target-scope.ts
function emptyInstalledArtifacts() {
  return {
    app: false,
    skill: false,
    agentsMcp: false
  };
}
function detectInstalledArtifacts(paths, root) {
  const out = emptyInstalledArtifacts();
  for (const target of INSTALL_TARGETS) {
    target.applyDetected(paths, root, out);
  }
  return out;
}
function resolveInstallScope(opts) {
  return {
    all: opts.all,
    skill: opts.skill,
    mcp: opts.mcp,
    configure: opts.configure,
    uninstall: opts.uninstall
  };
}
function buildDetectedSnapshot(root, paths) {
  const base = detectInstalledArtifacts(paths, root);
  return {
    ...base,
    appConfig: appConfigFileExists(root)
  };
}
function targetExplicitlyConfigured(user, key) {
  if (key === "skill" || key === "agentsMcp")
    return false;
  return user?.[key] !== undefined;
}
function agentCategoryInScope(key, categoryKeys, category, effective, targets, root) {
  if (!categoryKeys.includes(key))
    return false;
  if (!effective[key].enabled)
    return false;
  if (category === "mcp" && !resolveCapabilities(root).mcp)
    return false;
  return effective[key].includedInAll || targetExplicitlyConfigured(targets, key);
}
function isArtifactInScope(key, scope, effective, mode, root, targets) {
  const userTargets = targets ?? root.configure?.targets;
  if (mode === "uninstall-all") {
    return true;
  }
  if (mode === "refresh") {
    return effective[key].enabled;
  }
  if (mode === "install-all") {
    const t = effective[key];
    return t.enabled && t.includedInAll;
  }
  if (mode === "uninstall-scoped" || mode === "install-scoped") {
    if (!effective[key].enabled)
      return false;
    let inScope = false;
    if (scope.skill) {
      inScope = inScope || agentCategoryInScope(key, SKILL_KEYS, "skill", effective, userTargets, root);
    }
    if (scope.mcp) {
      inScope = inScope || agentCategoryInScope(key, MCP_KEYS, "mcp", effective, userTargets, root);
    }
    if (scope.configure && key === "configure") {
      inScope = true;
    }
    return inScope;
  }
  return false;
}
function shouldIncludeArtifact(key, root, paths, scope, mode, effective, detected) {
  const target = installTargetForKey(key);
  const targets = root.configure?.targets;
  if (key !== "configure" && target && !target.isAvailable(root, paths)) {
    return false;
  }
  if (key === "configure" && !root.appConfig) {
    return false;
  }
  if (mode === "refresh" && detected) {
    if (key === "app") {} else if (!detected[key]) {
      return false;
    }
  }
  if ((mode === "uninstall-all" || mode === "uninstall-scoped") && detected) {
    const det = detected[key];
    if (key === "configure") {
      if (!det)
        return false;
    } else if (mode === "uninstall-scoped") {
      if (!isArtifactInScope(key, scope, effective, mode, root, targets))
        return false;
      if (!det)
        return false;
    } else if (!det) {
      return false;
    }
  }
  if (mode === "uninstall-all") {
    return true;
  }
  if (mode === "uninstall-scoped") {
    return isArtifactInScope(key, scope, effective, mode, root, targets);
  }
  if (mode === "refresh") {
    if (key === "app")
      return false;
    return effective[key].enabled;
  }
  return isArtifactInScope(key, scope, effective, mode, root, targets);
}
function buildTargetPlanContext(root, paths, opts, detected) {
  const effective = resolveEffectiveInstallTargets(root.configure, root);
  const mode = resolveInstallPlanMode(opts);
  const scope = resolveInstallScope(opts);
  const detPartial = Object.fromEntries(INSTALL_TARGETS.map((t) => [t.key, t.detectedForSnapshot(detected)]));
  const include = (key) => shouldIncludeArtifact(key, root, paths, scope, mode, effective, detPartial);
  return {
    root,
    paths,
    opts,
    dry: !!opts.dry,
    detected,
    effective,
    scope,
    mode,
    include
  };
}
function resolveInstallTargetPreview(program, paths) {
  const effective = resolveEffectiveInstallTargets(program.configure, program);
  const keysForScope = (scope, mode) => INSTALL_ARTIFACT_KEYS.filter((key) => shouldIncludeArtifact(key, program, paths, scope, mode, effective));
  return {
    all: keysForScope({ all: true }, "install-all"),
    mcp: keysForScope({ mcp: true }, "install-scoped"),
    skill: keysForScope({ skill: true }, "install-scoped")
  };
}

// ../../src/configure/artifacts/target-plan-build.ts
function buildInstallPlanFromTargets(root, paths, opts) {
  const detected = buildDetectedSnapshot(root, paths);
  const ctx = buildTargetPlanContext(root, paths, opts, detected);
  const actions = [];
  const mcpEnabled = mcpCategoryEnabled(root);
  for (const target of INSTALL_TARGETS) {
    if (target.category === "mcp" && !mcpEnabled)
      continue;
    actions.push(...target.planInstall(ctx));
  }
  return actions;
}
function buildUninstallPlanFromTargets(root, paths, opts) {
  const detected = buildDetectedSnapshot(root, paths);
  const ctx = buildTargetPlanContext(root, paths, opts, detected);
  const actions = [];
  for (const target of INSTALL_TARGETS) {
    if (target.key === "configure")
      continue;
    actions.push(...target.planUninstall(ctx));
  }
  const configure = installTargetForKey("configure");
  if (configure) {
    actions.push(...configure.planUninstall(ctx));
  }
  return actions;
}

// ../../src/configure/artifacts/plan.ts
function buildUpdatePlan(root, paths, opts) {
  const refresh = buildInstallPlanFromTargets(root, paths, {
    ...opts,
    reinstall: true,
    all: true
  });
  if (refresh.length > 0) {
    return refresh;
  }
  return buildInstallPlanFromTargets(root, paths, { ...opts, reinstall: false, all: true });
}

// ../../src/configure/artifacts/target-detect.ts
function buildInstallStatus(paths, detected, root) {
  const status = {};
  for (const target of INSTALL_TARGETS) {
    target.contributeStatus(paths, root, detected, status);
  }
  return status;
}
// ../../src/configure/artifacts/status.ts
function installOut(msg, opts) {
  if (opts.json)
    return;
  process.stdout.write(`${msg}
`);
}
function installErr(msg) {
  process.stderr.write(`${msg}
`);
}
function printInstallStatus(root, opts) {
  const paths = resolveInstallPaths(root);
  const detected = detectInstalledArtifacts(paths, root);
  const status = buildInstallStatus(paths, detected, root);
  if (opts.json) {
    const preview = resolveInstallTargetPreview(root, paths);
    const json = {
      effective: {
        all: preview.all,
        mcp: preview.mcp,
        skill: preview.skill
      }
    };
    if (status.app)
      json.app = status.app;
    if (status.skill)
      json.skill = status.skill;
    if (status.agentsMcp)
      json.agentsMcp = status.agentsMcp;
    process.stdout.write(`${JSON.stringify(json, null, 2)}
`);
    return;
  }
  installOut(`Installed artifacts for ${root.key}:`, opts);
  const lines = [
    ["app", status.app],
    ["agent skill", status.skill],
    [".agents mcp", status.agentsMcp]
  ];
  let any = false;
  for (const [label, value] of lines) {
    if (value) {
      installOut(`  ${label}: ${value}`, opts);
      any = true;
    }
  }
  if (!any) {
    installOut("  (none detected)", opts);
  }
  const configStatus = appConfigStatus(root);
  if (configStatus) {
    installOut(`  app config: ${configStatus}`, opts);
  }
}

// ../../src/configure/index.ts
function appConfigHasEntries(program) {
  const entries = program.appConfig?.entries;
  return !!entries && Object.keys(entries).length > 0;
}
function configureHookContext(root, paths) {
  return {
    program: root,
    dry: false,
    paths: {
      agentsSkillDir: paths.agentsSkillDir,
      agentsMcpPath: paths.agentsMcpPath,
      mcpName: paths.mcpName,
      skillDirName: paths.skillDirName
    }
  };
}
async function runConfigureLifecycleHook(hook, root, paths) {
  if (!hook)
    return;
  await hook(configureHookContext(root, paths));
}
function executePlan(actions) {
  for (const action of actions) {
    action.run();
  }
}
function runInstallWizard(root) {
  if (!appConfigHasEntries(root))
    return;
  const { resolved } = bootstrapAppConfig(root, { validateFile: false });
  const missing = missingRequiredConfig(root, resolved);
  if (process.stdin.isTTY) {
    if (missing.length === 0)
      return;
    runConfigure(root, { context: "after-install", showHeading: true, rePromptAll: false });
    return;
  }
  if (missing.length > 0) {
    installErr(formatMissingConfigMessage(root, missing));
    process.exit(1);
  }
}
function confirmUninstall(root, yes) {
  if (yes || !process.stdin.isTTY)
    return;
  process.stderr.write(`Remove agent artifacts for ${root.key}? [y/N]: `);
  const ans = readPromptLine().trim().toLowerCase();
  if (ans !== "y" && ans !== "yes") {
    process.exit(0);
  }
}
async function cliConfigureInstall(root) {
  const paths = resolveInstallPaths(root);
  const installOpts = { reinstall: true, all: true };
  try {
    const bootstrapped = ensureAppConfigFile(root, false);
    if (bootstrapped) {
      process.stdout.write(`Initialized config: ${displayAppConfigPath(root)}
`);
    }
    const actions = buildUpdatePlan(root, paths, installOpts);
    executePlan(actions);
    runInstallWizard(root);
    await runConfigureLifecycleHook(root.configure?.afterInstall, root, paths);
  } catch (err) {
    installErr(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  process.exit(0);
}
async function cliConfigureUninstall(root, opts) {
  const paths = resolveInstallPaths(root);
  const uninstallOpts = { uninstall: true, all: true };
  confirmUninstall(root, !!opts.yes);
  try {
    await runConfigureLifecycleHook(root.configure?.beforeUninstall, root, paths);
    const actions = buildUninstallPlan(root, paths, uninstallOpts);
    executePlan(actions);
  } catch (err) {
    installErr(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  process.exit(0);
}
function cliConfigureStatus(root, opts) {
  printInstallStatus(root, { status: true, json: opts.json });
  process.exit(0);
}

// ../../src/builtins/config.ts
var JSON_OPTION = {
  name: "json",
  description: "Emit JSON (compact).",
  kind: "presence" /* Presence */
};
var PRETTY_OPTION = {
  name: "pretty",
  description: "Pretty-print JSON (requires --json).",
  kind: "presence" /* Presence */
};
function configGetOutput(program, key, json, pretty) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const { resolved } = bootstrapAppConfig(program, { validateFile: true });
  const entries = appConfig.entries;
  if (key !== undefined) {
    if (!(key in entries)) {
      process.stderr.write(`Unknown configuration key: ${key}
`);
      process.exit(1);
    }
    const entry = entries[key];
    if (!entry) {
      process.exit(1);
    }
    const value = resolved[key];
    if (json) {
      const out2 = configEntrySensitive(key, entry) && value !== undefined && String(value).length > 0 ? { set: true } : value ?? null;
      const space = pretty ? 2 : undefined;
      process.stdout.write(`${JSON.stringify(out2, null, space)}
`);
      return;
    }
    if (configEntrySensitive(key, entry)) {
      const set = value !== undefined && value !== null && String(value).length > 0;
      process.stdout.write(set ? `REDACTED
` : `(not set)
`);
      return;
    }
    if (value === undefined) {
      process.stdout.write(`(not set)
`);
      return;
    }
    if (typeof value === "object") {
      process.stdout.write(`${JSON.stringify(value)}
`);
      return;
    }
    process.stdout.write(`${String(value)}
`);
    return;
  }
  const out = {};
  for (const [k, entry] of Object.entries(entries)) {
    const value = resolved[k];
    if (configEntrySensitive(k, entry)) {
      out[k] = value !== undefined && value !== null && String(value).length > 0 ? json ? { set: true } : "REDACTED" : json ? null : "(not set)";
    } else {
      out[k] = value ?? (json ? null : "(not set)");
    }
  }
  if (json) {
    const space = pretty ? 2 : undefined;
    process.stdout.write(`${JSON.stringify(out, null, space)}
`);
    return;
  }
  for (const [k, v] of Object.entries(out)) {
    const title = entries[k]?.title ?? defaultConfigEntryTitle(k);
    process.stdout.write(`${title}: ${String(v)}
`);
  }
}
var FROM_ENV_OPTION = {
  name: "from-env",
  description: "Bind this key to its mapped environment variable (no literal value stored).",
  kind: "presence" /* Presence */
};
function configSetFromEnv(program, key) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const entry = appConfig.entries[key];
  if (!entry?.env) {
    process.stderr.write(`Configuration key '${key}' has no env mapping for --from-env.
`);
    process.exit(1);
  }
  const hostEnv = captureMappedHostEnv(program);
  const { fileData } = bootstrapAppConfig(program, { validateFile: true });
  let next = clearFileValue(fileData, key);
  next = setBinding(next, key, "env");
  writeAppConfigFile(program, next, { partial: true });
  const resolved = resolveAppConfig(program, next, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
}
function configSetRun(program, key, rawValue, useJson) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const entries = appConfig.entries;
  if (!(key in entries)) {
    process.stderr.write(`Unknown configuration key: ${key}
`);
    process.exit(1);
  }
  const jsonSchema = effectiveJsonSchema(program);
  if (!jsonSchema) {
    process.stderr.write(`Internal error: missing effective jsonSchema.
`);
    process.exit(1);
  }
  const propSchema = configPropertySchema(jsonSchema, key);
  let parsed;
  try {
    parsed = parseConfigSetValue(rawValue, propSchema, jsonSchema, useJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}
`);
    process.exit(1);
  }
  const hostEnv = captureMappedHostEnv(program);
  const { fileData } = bootstrapAppConfig(program, { validateFile: true });
  const next = setBinding({ ...fileData, [key]: parsed }, key, "file");
  writeAppConfigFile(program, next, { partial: true });
  const resolved = resolveAppConfig(program, next, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
}
function configGetLeaf(program) {
  return {
    key: "get",
    description: "Print resolved configuration value(s).",
    options: [JSON_OPTION, PRETTY_OPTION],
    positionals: [
      {
        name: "key",
        description: "Schema key to read (omit for all keys).",
        kind: "string" /* String */,
        argMin: 0,
        argMax: 1
      }
    ],
    handler: (ctx) => {
      const key = ctx.args[0];
      configGetOutput(program, key, ctx.hasFlag("json"), ctx.hasFlag("pretty"));
    }
  };
}
function configSetLeaf(program, mcpSetEnabled) {
  return {
    key: "set",
    description: "Write one configuration key to the config file.",
    options: [JSON_OPTION, FROM_ENV_OPTION],
    mcpTool: mcpSetEnabled ? undefined : { enabled: false },
    positionals: [
      {
        name: "key",
        description: "Schema key to write.",
        kind: "string" /* String */,
        argMin: 1,
        argMax: 1
      },
      {
        name: "value",
        description: "Value to store (comma-separated or JSON for primitive arrays; --json for objects and nested arrays).",
        kind: "string" /* String */,
        argMin: 0,
        argMax: 1
      }
    ],
    handler: (ctx) => {
      const key = ctx.args[0];
      if (!key) {
        process.stderr.write(`configure set requires a key.
`);
        process.exit(1);
      }
      if (ctx.hasFlag("from-env")) {
        const raw2 = ctx.args[1];
        if (raw2 !== undefined && raw2.length > 0) {
          process.stderr.write(`configure set --from-env does not accept a value.
`);
          process.exit(1);
        }
        configSetFromEnv(program, key);
        return;
      }
      const raw = ctx.args[1];
      if (raw === undefined || raw.length === 0) {
        if (!ctx.hasFlag("json")) {
          process.stderr.write(`configure set requires a value (or --from-env).
`);
          process.exit(1);
        }
        process.stderr.write(`configure set requires a value.
`);
        process.exit(1);
      }
      configSetRun(program, key, raw, ctx.hasFlag("json"));
    }
  };
}
function configureConfigSubcommands(program, mcpSetEnabled = configMcpSetEnabled(program)) {
  if (!program.appConfig) {
    throw new Error("configure config subcommands require program.appConfig");
  }
  return [configGetLeaf(program), configSetLeaf(program, mcpSetEnabled)];
}

// ../../src/builtins/configure-copy.ts
var LABEL = {
  mcp: { prose: "MCP config", short: "MCP" },
  config: { prose: "app config", short: "config" }
};
function enabledKinds(program, caps) {
  const kinds = [];
  if (caps.mcp && program.mcpServer?.enabled)
    kinds.push("mcp");
  if (program.appConfig && Object.keys(program.appConfig.entries).length > 0)
    kinds.push("config");
  return kinds;
}
function joinEnglish(items) {
  if (items.length === 0)
    return "agent artifacts";
  if (items.length === 1)
    return items[0] ?? "agent artifacts";
  if (items.length === 2)
    return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
function prose(program, caps) {
  return joinEnglish(enabledKinds(program, caps).map((k) => LABEL[k].prose));
}
function configureCommandDescription(program, caps) {
  return `Set up ${prose(program, caps)} for this app (binary via Homebrew).`;
}
function configureCommandNotes(program, _caps) {
  const app = program.key;
  const lines = [
    "Set up agent artifacts after the binary is installed via Homebrew (see README for tap install).",
    "",
    "Homebrew installs the binary and shell completions only. Agent artifacts live under ~/.agents and are not written during brew install.",
    "",
    "After install or upgrade:",
    `  ${app} configure install`,
    "",
    "Upgrade:",
    `  brew upgrade ${app}`,
    `  ${app} configure install`,
    "",
    "Shell completions are installed by Homebrew during brew install.",
    "See: https://docs.brew.sh/Shell-Completion",
    "",
    "See what is installed:",
    `  ${app} configure status`,
    "",
    "Uninstall:",
    `  ${app} configure uninstall`,
    `  brew uninstall <tap>/${app}`,
    ""
  ];
  if (program.appConfig && Object.keys(program.appConfig.entries).length > 0) {
    lines.push("Set configuration values:", `  ${app} configure set <key> <value>`, "");
  }
  lines.push("Use `configure status --json` for machine-readable output.");
  return lines.join(`
`);
}

// ../../src/builtins/configure.ts
var YES_OPTION = {
  name: "yes",
  description: "Skip uninstall confirmation.",
  kind: "presence" /* Presence */,
  shortName: "y"
};
var JSON_OPTION2 = {
  name: "json",
  description: "Print status JSON on stdout.",
  kind: "presence" /* Presence */
};
function isConfigureConfigPath(path) {
  return path.length >= 2 && (path[1] === "get" || path[1] === "set");
}
function configureInstallLeaf(program) {
  return {
    key: "install",
    description: "Install agent artifacts and bootstrap app config.",
    handler: async () => {
      await cliConfigureInstall(program);
    }
  };
}
function configureUninstallLeaf(program) {
  return {
    key: "uninstall",
    description: "Remove agent artifacts and app config.",
    options: [YES_OPTION],
    handler: async (ctx) => {
      await cliConfigureUninstall(program, { yes: ctx.hasFlag("yes") });
    }
  };
}
function configureStatusLeaf(program) {
  return {
    key: "status",
    description: "Print what is currently installed (read-only).",
    options: [JSON_OPTION2],
    handler: (ctx) => {
      cliConfigureStatus(program, { json: ctx.hasFlag("json") });
    }
  };
}
function cliBuiltinConfigureCommand(root) {
  const caps = resolveCapabilities(root);
  const commands = [configureInstallLeaf(root), configureUninstallLeaf(root), configureStatusLeaf(root)];
  if (configCommandsEnabled(root)) {
    commands.push(...configureConfigSubcommands(root, configMcpSetEnabled(root)));
  }
  return {
    key: "configure",
    description: configureCommandDescription(root, caps),
    notes: configureCommandNotes(root, caps),
    commands
  };
}

// ../../src/builtins/http.ts
var HTTP_SERVE_OPTIONS = [
  { name: "host", description: "Listen host.", kind: "string" /* String */ },
  { name: "port", description: "Listen port.", kind: "number" /* Number */ },
  { name: "trust-proxy", description: "Honor X-Forwarded-For for client IP.", kind: "presence" /* Presence */ },
  { name: "obscure-errors", description: "Hide unexpected errors from clients.", kind: "presence" /* Presence */ },
  {
    name: "log-format",
    description: "Log format: json (ECS Logging) or text.",
    kind: "enum" /* Enum */,
    choices: ["json", "text"]
  },
  {
    name: "log-file",
    description: "Append logs to this file (relative → app config dir).",
    kind: "string" /* String */
  },
  { name: "no-access-log", description: "Disable HTTP access logs.", kind: "presence" /* Presence */ },
  { name: "dev", description: "Print full stacks to stderr on errors.", kind: "presence" /* Presence */ }
];
function cliBuiltinHttpCommand(program) {
  const caps = resolveCapabilities(program);
  const { hostname, port } = resolveHttpListenAddress(program);
  const userGlob = httpUserPathGlob(resolveHttpPathPrefix(program));
  const lines = [
    `HTTP tool server on http://${hostname}:${port}.`,
    "",
    `Endpoints: GET /health/liveness, GET /health/readiness, GET /openapi.json, GET /swagger, ${userGlob}`,
    ""
  ];
  if (caps.configure) {
    lines.push("Configure app settings:", "", "  {argsbarg:program} configure", "");
  }
  if (docsEnabled(program)) {
    lines.push("Full setup guide: {argsbarg:program} docs http");
  }
  const serve = {
    key: "serve",
    cli: { hidden: true },
    description: "Run as an HTTP API server for tools.",
    handler: () => {}
  };
  return {
    key: "http",
    description: "HTTP API server for tools.",
    notes: lines.join(`
`),
    options: [...HTTP_SERVE_OPTIONS],
    fallbackCommand: "serve",
    fallbackMode: "missingOnly" /* MissingOnly */,
    commands: [serve]
  };
}

// ../../src/builtins/mcp.ts
var MCP_SERVE_OPTIONS = [
  { name: "obscure-errors", description: "Hide unexpected errors from clients.", kind: "presence" /* Presence */ },
  {
    name: "log-format",
    description: "Log format: json (ECS Logging) or text.",
    kind: "enum" /* Enum */,
    choices: ["json", "text"]
  },
  {
    name: "log-file",
    description: "Append logs to this file (relative → app config dir).",
    kind: "string" /* String */
  },
  { name: "dev", description: "Print full stacks to stderr on errors.", kind: "presence" /* Presence */ }
];
function cliBuiltinMcpCommand(program) {
  const caps = resolveCapabilities(program);
  const lines = [
    "Stdio MCP server. Add to Cursor, Claude Code, or Claude Desktop:",
    "",
    "  command: {argsbarg:program}",
    "  args: mcp",
    ""
  ];
  if (caps.configure) {
    lines.push("Or:", "", "  {argsbarg:program} configure", "");
  }
  if (docsEnabled(program)) {
    lines.push("Full setup guide: {argsbarg:program} docs mcp");
  }
  const serve = {
    key: "serve",
    cli: { hidden: true },
    description: "Run as an MCP server over stdio for AI agents.",
    handler: () => {}
  };
  const bundle = {
    key: "bundle",
    description: "Pack dist MCP artifacts (`.mcpb`, Claude Code plugin zip, Cursor plugin zip) from dist/<key>.",
    handler: () => {}
  };
  return {
    key: "mcp",
    description: "MCP server and bundle tools.",
    notes: lines.join(`
`),
    options: [...MCP_SERVE_OPTIONS],
    fallbackCommand: "serve",
    fallbackMode: "missingOnly" /* MissingOnly */,
    commands: [serve, bundle]
  };
}

// ../../src/builtins/version.ts
function cliBuiltinVersionCommand() {
  return {
    key: "version",
    description: "Print the program version.",
    handler: () => {}
  };
}

// ../../src/builtins/registry.ts
function pushBuiltin(builtins, program, factory) {
  if (!factory) {
    return;
  }
  const node = factory(program);
  if (node) {
    builtins.push(node);
  }
}
function resolveBuiltins(program, caps) {
  const builtins = [];
  if (caps.completion) {
    pushBuiltin(builtins, program, (p) => cliBuiltinCompletionGroup(p));
  }
  pushBuiltin(builtins, program, () => cliBuiltinVersionCommand());
  if (caps.configure) {
    pushBuiltin(builtins, program, (p) => cliBuiltinConfigureCommand(p));
  }
  pushBuiltin(builtins, program, (p) => cliBuiltinDocsGroupIfEnabled(p) ?? null);
  if (caps.mcp) {
    pushBuiltin(builtins, program, (p) => cliBuiltinMcpCommand(p));
  }
  if (caps.http) {
    pushBuiltin(builtins, program, (p) => cliBuiltinHttpCommand(p));
  }
  return builtins;
}

// ../../src/builtins/export.ts
function exportBuiltinNode(cmd) {
  if (isCliSchemaHidden(cmd)) {
    return null;
  }
  const out = {
    key: cmd.key,
    description: cmd.description
  };
  if ((cmd.notes ?? "").length > 0) {
    out.notes = cmd.notes;
  }
  const options = visibleOptions(cmd.options);
  if (options.length > 0) {
    out.options = options;
  }
  if (isCliRouter(cmd)) {
    if (cmd.fallbackCommand !== undefined) {
      out.fallbackCommand = cmd.fallbackCommand;
    }
    if (cmd.fallbackMode !== undefined) {
      out.fallbackMode = cmd.fallbackMode;
    }
    const children = cmd.commands.map((ch) => exportBuiltinNode(ch)).filter((ch) => ch !== null);
    if (children.length > 0) {
      out.commands = children;
    }
  }
  return out;
}
function exportPresentationBuiltins(program) {
  const caps = resolveCapabilities(program);
  return resolveBuiltins(program, caps).map((cmd) => exportBuiltinNode(cmd)).filter((node) => node !== null);
}

// ../../src/core/schema.ts
var RESERVED = new Set(["http", "completion", "configure", "docs", "mcp", "version"]);
function exportCommand(cmd, root) {
  if (isCliSchemaHidden(cmd)) {
    return null;
  }
  const out = {
    key: cmd.key,
    description: cmd.description
  };
  if ((cmd.notes ?? "").length > 0) {
    out.notes = cmd.notes;
  }
  const options = visibleOptions(cmd.options);
  if (options.length > 0) {
    out.options = options;
  }
  if (isCliLeaf(cmd)) {
    if ((cmd.positionals ?? []).length > 0) {
      out.positionals = cmd.positionals;
    }
    out.inputSchema = buildLeafInputSchema(cmd);
    const outputSchema = leafOutputSchema(cmd);
    if (outputSchema !== undefined) {
      out.outputSchema = outputSchema;
    } else if (cmd.http?.successContentType !== undefined) {
      out.outputContentType = cmd.http.successContentType;
    }
    out.commands = exportPresentationBuiltins(root);
    return out;
  }
  if (cmd.fallbackCommand !== undefined) {
    out.fallbackCommand = cmd.fallbackCommand;
  }
  if (cmd.fallbackMode !== undefined) {
    out.fallbackMode = cmd.fallbackMode;
  }
  const children = isCliRouter(cmd) ? cmd.commands.filter((ch) => !RESERVED.has(ch.key)) : [];
  if (children.length > 0) {
    out.commands = children.map((ch) => exportCommand(ch, root)).filter((ch) => ch !== null);
  }
  return out;
}
function resolveSchemaNotes(node, appKey) {
  const out = { ...node };
  if ((out.notes ?? "").length > 0 && out.notes !== undefined) {
    out.notes = cliResolveNotes(out.notes, appKey);
  }
  if (out.commands) {
    out.commands = out.commands.map((ch) => resolveSchemaNotes(ch, appKey));
  }
  return out;
}
function cliSchemaExport(root) {
  const exported = exportCommand(root, root);
  const errorSchema = root.httpServer?.errors?.errorSchema ?? root.mcpServer?.errors?.errorSchema;
  const base = !exported ? {
    key: root.key,
    description: root.description,
    commands: exportPresentationBuiltins(root)
  } : resolveSchemaNotes(exported, root.key);
  if (errorSchema !== undefined) {
    base.errorSchema = errorSchema;
  }
  return base;
}
function cliSchemaJson(root) {
  return `${JSON.stringify(cliSchemaExport(root), null, 2)}
`;
}

// ../../src/mcp/tools.ts
function defaultMcpSchemaUri(mcpId) {
  return `${mcpId}://schema`;
}
function sanitizeToolSegment(key) {
  return key.replace(/[^a-zA-Z0-9]/g, "_");
}
function mcpServerId(root) {
  return sanitizeToolSegment(root.key);
}
function mcpToolDescription(path, rootKey, description) {
  const prefix = path.length > 0 ? path.join(" ") : rootKey;
  return `${prefix} — ${description}`;
}
function mcpToolName(root, path) {
  if (path.length === 0) {
    return sanitizeToolSegment(root.key);
  }
  return path.map(sanitizeToolSegment).join("_");
}
function leafHasYesOption(leaf) {
  return visibleOptions(leaf.options).some((opt) => opt.name === "yes" && opt.kind === "presence" /* Presence */);
}
function formatMcpOptionValue(opt, val) {
  if (opt.format === "comma-list" /* CommaList */) {
    if (Array.isArray(val)) {
      const items = val.map(String).filter(Boolean);
      if (items.length === 0) {
        return { error: `Option --${opt.name} requires at least one value` };
      }
      return items.join(",");
    }
    if (typeof val === "string") {
      return val;
    }
    return { error: `Option --${opt.name} must be a string or array of strings` };
  }
  return String(val);
}
function resolveToolDescription(root, path, leaf) {
  let desc;
  if (leaf.mcpTool?.description) {
    desc = leaf.mcpTool.description;
  } else {
    desc = mcpToolDescription(path, root.key, leaf.description);
  }
  const notes = (leaf.notes ?? "").trim();
  if (notes.length > 0) {
    desc += `

${cliResolveNotes(notes, root.key)}`;
  }
  return desc;
}
function allMcpResources(root) {
  const schemaUri = resolveMcpSchemaUri(root);
  const builtIn = {
    uri: schemaUri,
    name: "cli-schema",
    description: "Full CLI command tree (same as docs cli-schema).",
    mimeType: "application/json",
    load: () => cliSchemaJson(root)
  };
  const user = (root.mcpServer?.resources ?? []).map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType ?? "text/plain",
    load: r.load
  }));
  return [builtIn, ...docsMcpResources(root), ...user];
}
function collectMcpTools(root) {
  const out = [];
  function walk2(cmd, path) {
    if (isCliLeaf(cmd)) {
      if (cmd.key === "completion" || cmd.key === "configure" || cmd.key === "mcp" || cmd.key === "version") {
        return;
      }
      if (isMcpHidden(cmd)) {
        return;
      }
      const outputSchema = leafOutputSchema(cmd);
      out.push({
        name: mcpToolName(root, path),
        description: resolveToolDescription(root, path, cmd),
        path,
        leaf: cmd,
        inputSchema: buildLeafInputSchema(cmd),
        ...outputSchema === undefined ? {} : { outputSchema }
      });
      return;
    }
    for (const ch of cmd.commands) {
      walk2(ch, [...path, ch.key]);
    }
  }
  if (isCliLeaf(root)) {
    walk2(root, []);
  } else {
    for (const ch of root.commands) {
      walk2(ch, [ch.key]);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function resolveMcpServerInfo(root) {
  return {
    name: mcpServerId(root),
    version: root.version
  };
}
function resolveMcpSchemaUri(root) {
  if (root.mcpServer?.schemaResourceUri) {
    return root.mcpServer.schemaResourceUri;
  }
  return defaultMcpSchemaUri(mcpServerId(root));
}
function mcpToolCallToArgv(_root, tool, args) {
  if (isDocumentLeaf(tool.leaf)) {
    return [...tool.path];
  }
  const argv = [...tool.path];
  for (const opt of leafWireOptions(tool.leaf)) {
    if (opt.kind === "json" /* Json */) {
      continue;
    }
    const val = args[opt.name];
    if (val === undefined) {
      continue;
    }
    if (opt.kind === "presence" /* Presence */) {
      if (val === true) {
        argv.push(`--${opt.name}`);
      }
      continue;
    }
    const formatted = formatMcpOptionValue(opt, val);
    if (typeof formatted !== "string") {
      return formatted;
    }
    argv.push(`--${opt.name}`, formatted);
  }
  if (leafHasYesOption(tool.leaf) && !argv.includes("--yes")) {
    argv.push("--yes");
  }
  for (const p of tool.leaf.positionals ?? []) {
    const val = args[p.name];
    const { argMin = 1, argMax = 1 } = p;
    if (argMax === 0) {
      const raw = args[p.name];
      if (raw === undefined) {
        if (argMin >= 1) {
          return { error: `Missing argument: ${p.name} (use a JSON array)` };
        }
        continue;
      }
      if (!Array.isArray(raw)) {
        return {
          error: `Argument ${p.name} must be a JSON array of strings (not a comma-separated string)`
        };
      }
      const items = raw.map(String).filter(Boolean);
      if (items.length === 0 && argMin >= 1) {
        return { error: `Missing argument: ${p.name}` };
      }
      argv.push(...items);
      continue;
    }
    if (val === undefined) {
      if (argMin >= 1) {
        return { error: `Missing argument: ${p.name}` };
      }
      continue;
    }
    argv.push(String(val));
  }
  return argv;
}

// ../../src/config/file.ts
function resolveAppConfigPath(program) {
  const dirName = sanitizeToolSegment(program.key);
  return join5(appConfigLibHome(), dirName, "config.json");
}
function resolveAppConfigDir(program) {
  return dirname5(resolveAppConfigPath(program));
}
function displayAppConfigPath(program) {
  return displayHomePath(resolveAppConfigPath(program));
}
function parseConfigJson(text, path) {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("root must be a JSON object");
    }
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in config file ${displayHomePath(path)}: ${msg}`);
  }
}
function readAppConfigFileRaw(path) {
  if (!existsSync6(path)) {
    return {};
  }
  let text;
  try {
    text = readFileSync2(path, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read config file ${displayHomePath(path)}: ${msg}`);
  }
  return parseConfigJson(text, path);
}
function isEmptyConfigDocument(data) {
  return Object.keys(data).every((k) => isFrameworkConfigKey(k));
}
function appConfigFileExists(program) {
  return existsSync6(resolveAppConfigPath(program));
}
function validateAppConfigData(program, data, pathLabel, opts = {}) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    throw new Error("program.appConfig is not set");
  }
  const where = pathLabel ? displayHomePath(pathLabel) : "config";
  const bindingErrors = validateBindingsShape(data);
  if (bindingErrors.length > 0) {
    throw new Error(`Invalid config in ${where}: ${bindingErrors.join("; ")}`);
  }
  const allowed = new Set(Object.keys(appConfig.entries));
  for (const key of Object.keys(data)) {
    if (isFrameworkConfigKey(key))
      continue;
    if (!allowed.has(key)) {
      throw new Error(`Unknown config key '${key}' in ${where}`);
    }
  }
  const jsonSchema = effectiveJsonSchema(program);
  if (!jsonSchema) {
    return;
  }
  if (opts.partial || isEmptyConfigDocument(data)) {
    const result2 = validateConfigDocumentPartial(data, jsonSchema);
    if (!result2.valid) {
      throw new Error(`Invalid config in ${where}: ${result2.errors.join("; ")}`);
    }
    return;
  }
  const result = validateConfigDocument(data, jsonSchema);
  if (!result.valid) {
    throw new Error(`Invalid config in ${where}: ${result.errors.join("; ")}`);
  }
}
function writeAppConfigFileRaw(program, data, dry = false) {
  const path = resolveAppConfigPath(program);
  if (dry)
    return;
  mkdirSync4(dirname5(path), { recursive: true });
  writeFileSync3(path, `${JSON.stringify(data, null, 2)}
`, { mode: 384 });
}
function ensureAppConfigFile(program, dry = false) {
  const path = resolveAppConfigPath(program);
  if (existsSync6(path)) {
    return null;
  }
  writeAppConfigFileRaw(program, {}, dry);
  return path;
}
function readAppConfigFile(program) {
  const path = resolveAppConfigPath(program);
  const data = readAppConfigFileRaw(path);
  if (isEmptyConfigDocument(data)) {
    return data;
  }
  validateAppConfigData(program, data, path);
  return data;
}
function writeAppConfigFile(program, data, opts = {}) {
  validateAppConfigData(program, data, displayAppConfigPath(program), opts);
  writeAppConfigFileRaw(program, data);
}
function appConfigInstalled(program) {
  return appConfigFileExists(program);
}
function uninstallAppConfig(program, dry) {
  const path = resolveAppConfigPath(program);
  const dir = resolveAppConfigDir(program);
  const hasFile = existsSync6(path);
  const hasDir = existsSync6(dir);
  if (!hasFile && !hasDir) {
    return [];
  }
  const changed = [];
  if (hasFile)
    changed.push(path);
  if (hasDir)
    changed.push(`${dir}/`);
  if (!dry) {
    if (hasFile)
      unlinkSync(path);
    if (hasDir)
      rmSync2(dir, { recursive: true, force: true });
    process.stdout.write(`Removed app config ${displayAppConfigPath(program)}
`);
  }
  return changed;
}
// ../../src/config/context.ts
function rebuildResolved(program, fileData) {
  const hostEnv = captureMappedHostEnv(program);
  const resolved = resolveAppConfig(program, fileData, hostEnv);
  exportConfigToEnv(program, resolved, hostEnv);
  return resolved;
}

class EmptyAppConfigSnapshot {
  program;
  fileData;
  constructor(program, fileData) {
    this.program = program;
    this.fileData = fileData ?? readAppConfigFileRaw(resolveAppConfigPath(program));
  }
  get(_key) {
    return;
  }
  require(key) {
    throw new Error(`Configuration key '${key}' is not available (program.appConfig is not set)`);
  }
  set(_key, _value) {
    throw new Error("program.appConfig is not set");
  }
  read() {
    return {};
  }
  readUnsafe() {
    return { ...this.fileData };
  }
  getUnsafe(key) {
    return this.fileData[key];
  }
  setUnsafe(key, value) {
    const next = { ...this.fileData, [key]: value };
    writeAppConfigFileRaw(this.program, next);
    this.fileData = next;
  }
  get path() {
    return resolveAppConfigPath(this.program);
  }
  get dir() {
    return resolveAppConfigDir(this.program);
  }
}

class AppConfigSnapshot {
  program;
  snapshot;
  fileData;
  constructor(program, fileData, resolved) {
    this.program = program;
    this.fileData = { ...fileData };
    this.snapshot = { ...resolved };
  }
  get(key) {
    this.assertEntryKey(key);
    return this.snapshot[key];
  }
  require(key) {
    const value = this.get(key);
    if (value === undefined || value === null || typeof value === "string" && value.length === 0) {
      throw new Error(`Missing required configuration: ${key}`);
    }
    return value;
  }
  set(key, value) {
    this.assertEntryKey(key);
    const jsonSchema = effectiveJsonSchema(this.program);
    if (!jsonSchema) {
      throw new Error("Internal error: missing effective jsonSchema.");
    }
    const propSchema = configPropertySchema(jsonSchema, key);
    validateParsedConfigValue(value, propSchema, jsonSchema);
    const next = setBinding({ ...this.fileData, [key]: value }, key, "file");
    this.persistFileData(next);
  }
  read() {
    return { ...this.snapshot };
  }
  readUnsafe() {
    return { ...this.fileData };
  }
  getUnsafe(key) {
    return this.fileData[key];
  }
  setUnsafe(key, value) {
    this.assertUnsafeKey(key);
    const next = { ...this.fileData, [key]: value };
    this.persistFileData(next);
  }
  get path() {
    return resolveAppConfigPath(this.program);
  }
  get dir() {
    return resolveAppConfigDir(this.program);
  }
  refresh(fileData, resolved) {
    this.fileData = { ...fileData };
    this.snapshot = { ...resolved };
  }
  persistFileData(next) {
    writeAppConfigFile(this.program, next, { partial: true });
    this.fileData = next;
    this.snapshot = rebuildResolved(this.program, next);
  }
  assertEntryKey(key) {
    const entries = this.program.appConfig?.entries;
    if (!entries || !(key in entries)) {
      throw new Error(`Unknown configuration key: ${key}`);
    }
  }
  assertUnsafeKey(key) {
    if (isFrameworkConfigKey(key))
      return;
    this.assertEntryKey(key);
  }
}
function createAppConfigSnapshot(program, fileData, resolved) {
  if (!program.appConfig) {
    return new EmptyAppConfigSnapshot(program, fileData);
  }
  return new AppConfigSnapshot(program, fileData, resolved);
}

// ../../src/core/context.ts
class CliContext {
  appName;
  commandPath;
  args;
  program;
  opts;
  invocation;
  appConfig;
  toolArgs;
  pathParams;
  preloadedJson;
  locals;
  runtime;
  response;
  leafInputsCache;
  constructor(appName, commandPath2, args, opts, program, invocation = "cli", appConfig = new EmptyAppConfigSnapshot(program), toolArgs, preloadedJson = {}, pathParams = {}, locals = {}, runtime) {
    this.appName = appName;
    this.commandPath = commandPath2;
    this.args = args;
    this.opts = opts;
    this.program = program;
    this.invocation = invocation;
    this.appConfig = appConfig;
    this.toolArgs = toolArgs;
    this.preloadedJson = preloadedJson;
    this.pathParams = pathParams;
    this.locals = locals;
    this.runtime = runtime;
  }
  respond(opts) {
    if (this.response !== undefined) {
      throw new Error("ctx.respond() was already called for this invocation");
    }
    const normalized = normalizeRespondOptions(opts);
    if (this.invocation === "cli") {
      writeRespondBodyToStdout(normalized.body);
      return;
    }
    this.response = normalized;
  }
  getResponse() {
    return this.response;
  }
  hasFlag(name) {
    return this.opts[name] !== undefined;
  }
  stringOpt(name) {
    return this.opts[name];
  }
  numberOpt(name) {
    const s = this.opts[name];
    if (s === undefined)
      return null;
    return strictParseDouble(s);
  }
  typedOpt(name, parse2) {
    const s = this.opts[name];
    if (s === undefined)
      return null;
    try {
      return parse2(s);
    } catch {
      return null;
    }
  }
  durationOpt(name) {
    const s = this.opts[name];
    if (s === undefined)
      return;
    return parseDurationMs(s);
  }
  commaListOpt(name) {
    const s = this.opts[name];
    if (s === undefined)
      return;
    return parseCommaList(s);
  }
  dateOpt(name) {
    const s = this.opts[name];
    if (s === undefined)
      return;
    return parseDate(s);
  }
  dateTimeOpt(name) {
    const s = this.opts[name];
    if (s === undefined)
      return;
    return parseDateTime(s);
  }
  jsonOpt(name) {
    return readJsonOptionValue(this, name);
  }
  positional(name) {
    return this._positionalMap()[name];
  }
  get inputs() {
    if (this.leafInputsCache !== undefined) {
      return this.leafInputsCache;
    }
    this.leafInputsCache = loadLeafInputs(this);
    return this.leafInputsCache;
  }
  inputsAs() {
    return this.inputs;
  }
  _leafNode() {
    let node = this.program;
    for (const seg of this.commandPath) {
      if (!isCliRouter(node))
        return;
      const child = node.commands.find((c) => c.key === seg);
      if (!child)
        return;
      node = child;
    }
    return isCliLeaf(node) ? node : undefined;
  }
  _posMap;
  _positionalMap() {
    if (this._posMap)
      return this._posMap;
    const leaf = this._leafNode();
    if (!leaf) {
      this._posMap = {};
      return {};
    }
    const map = {};
    let argIdx = 0;
    for (const p of leaf.positionals ?? []) {
      const { argMax = 1 } = p;
      if (argMax === 0) {
        map[p.name] = this.args.slice(argIdx);
        argIdx = this.args.length;
      } else {
        const val = this.args[argIdx];
        if (val !== undefined)
          map[p.name] = val;
        argIdx++;
      }
    }
    this._posMap = map;
    return map;
  }
}
// ../../src/mcp/bundle.ts
import { cpSync as cpSync4, existsSync as existsSync10, mkdirSync as mkdirSync8, mkdtempSync as mkdtempSync3, readFileSync as readFileSync4, rmSync as rmSync5, writeFileSync as writeFileSync7 } from "node:fs";
import { tmpdir as tmpdir3 } from "node:os";
import { basename as basename3, join as join9, resolve as resolve4 } from "node:path";

// ../../src/config/manifest.ts
function buildConfigUserConfigEntry(key, entry, jsonSchemaRequired) {
  return {
    type: "string",
    title: entry.title ?? defaultConfigEntryTitle(key),
    description: entry.description,
    sensitive: configEntrySensitive(key, entry),
    required: configEntryRequired(key, entry, jsonSchemaRequired)
  };
}
function buildProgramUserConfig(program) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const jsonSchema = effectiveJsonSchema(program);
  const fromSchema = jsonSchema ? jsonSchemaRequiredKeys(jsonSchema) : undefined;
  const out = {};
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!entry.env) {
      continue;
    }
    out[configUserConfigKey(key)] = buildConfigUserConfigEntry(key, entry, fromSchema);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
function buildPluginMcpEnvMapping(program) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const out = {};
  for (const [key, entry] of Object.entries(appConfig.entries)) {
    if (!entry.env) {
      continue;
    }
    const manifestKey = configUserConfigKey(key);
    out[entry.env] = `\${user_config.${manifestKey}}`;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
function buildCursorPluginMcpEnvMapping(program) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const out = {};
  for (const entry of Object.values(appConfig.entries)) {
    if (!entry.env) {
      continue;
    }
    out[entry.env] = `\${${entry.env}}`;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
function buildCursorPluginVariables(program) {
  const appConfig = program.appConfig;
  if (!appConfig) {
    return;
  }
  const properties = {};
  const required = [];
  for (const entry of Object.values(appConfig.entries)) {
    if (!entry.env) {
      continue;
    }
    properties[entry.env] = {
      type: "string",
      ...entry.description ? { description: entry.description } : {}
    };
    if (entry.required) {
      required.push(entry.env);
    }
  }
  if (Object.keys(properties).length === 0) {
    return;
  }
  return {
    type: "object",
    properties,
    ...required.length > 0 ? { required } : {}
  };
}

// ../../src/mcp/claude.ts
import { cpSync as cpSync2, existsSync as existsSync8, mkdirSync as mkdirSync6, mkdtempSync, rmSync as rmSync3, writeFileSync as writeFileSync5 } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join as join7, resolve as resolve2 } from "node:path";

// ../../src/mcp/plugin-shared.ts
import {
  cpSync,
  existsSync as existsSync7,
  mkdirSync as mkdirSync5,
  readdirSync,
  readFileSync as readFileSync3,
  statSync,
  writeFileSync as writeFileSync4
} from "node:fs";
import { join as join6, relative, resolve } from "node:path";

// ../../src/skill/generate.ts
function truncate(text, maxLen) {
  if (text.length <= maxLen)
    return text;
  return `${text.slice(0, maxLen - 1)}…`;
}
function pluginSkillDescription(root) {
  const tools = collectMcpTools(root);
  const paths = tools.map((t) => t.path.length > 0 ? t.path.join(" ") : root.key);
  const sample = paths.slice(0, 5).join(", ");
  const more = paths.length > 5 ? `, and ${paths.length - 5} more` : "";
  const desc = `Use the ${root.key} MCP toolset (${sample}${more}). Use when the user mentions ${root.key}${paths.length > 0 ? `, ${paths.slice(0, 3).join(", ")}` : ""}, or related tasks.`;
  return truncate(desc, 1024);
}
function buildConfigurationSection(root) {
  if (!root.appConfig || Object.keys(root.appConfig.entries).length === 0) {
    return [];
  }
  const entries = root.appConfig.entries;
  const lines = ["## Configuration", ""];
  for (const name of Object.keys(entries).sort()) {
    const entry = entries[name];
    if (!entry)
      continue;
    const title = defaultConfigEntryTitle(name);
    const envStr = entry.env ? ` (env: \`${entry.env}\`)` : "";
    const desc = entry.description ? ` — ${entry.description}` : "";
    lines.push(`- **${name}** (\`${title}\`${envStr})${desc}`);
  }
  lines.push("");
  return lines;
}
function buildPluginSkillMd(root, dirName) {
  const lines = [
    "---",
    `name: ${dirName}`,
    `description: ${pluginSkillDescription(root)}`,
    "---",
    "",
    `# ${root.key}`,
    "",
    root.description,
    "",
    "## MCP Tools",
    "",
    `Server id: \`${mcpServerId(root)}\``,
    "",
    "Prefer using MCP tools over terminal commands when available.",
    "",
    `- Run \`tools/list\` against \`${mcpServerId(root)}\` to discover tools.`,
    `- Read schema resource \`${resolveMcpSchemaUri(root)}\` for types.`,
    ""
  ];
  const tools = collectMcpTools(root);
  if (tools.length > 0) {
    lines.push("### Available tools", "");
    for (const tool of tools) {
      const toolName = sanitizeToolSegment(tool.path.join("_"));
      const desc = tool.leaf.description;
      const wire = leafWireOptions(tool.leaf);
      const flags = wire.length > 0 ? ` (flags: ${wire.map((o) => `--${o.name}`).join(", ")})` : "";
      lines.push(`- \`${toolName}\` — ${desc}${flags}`);
    }
    lines.push("");
  }
  lines.push(...buildConfigurationSection(root));
  lines.push("## Claude Code plugin", "", `Invoke with \`/${dirName}\` or let Claude auto-match from the description.`, "");
  return lines.join(`
`);
}
function generatePluginSkillBundle(root) {
  const dirName = sanitizeToolSegment(root.key);
  return {
    dirName,
    skillMd: buildPluginSkillMd(root, dirName)
  };
}

// ../../src/mcp/plugin-shared.ts
function collectZipEntries(rootDir, dir = rootDir) {
  const entries = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join6(dir, ent.name);
    if (ent.isDirectory()) {
      entries.push(...collectZipEntries(rootDir, full));
      continue;
    }
    if (!ent.isFile()) {
      continue;
    }
    const rel = relative(rootDir, full).split("\\").join("/");
    const stMode = statSync(full).mode;
    const entry = { name: rel, data: readFileSync3(full) };
    if (stMode & 73) {
      entry.unixMode = stMode;
    }
    entries.push(entry);
  }
  return entries;
}
function defaultAuthor(bundle) {
  return bundle?.author ?? { name: "Unknown" };
}
function pluginName(program) {
  return program.key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}
function stagePluginSkills(pluginRoot, program, cwd) {
  const dirName = sanitizeToolSegment(program.key);
  const repoSkillDir = program.mcpServer?.bundle?.skillsDir ? resolve(cwd, program.mcpServer.bundle.skillsDir) : join6(cwd, "skills", dirName);
  if (existsSync7(repoSkillDir) && statSync(repoSkillDir).isDirectory()) {
    const targetDir = join6(pluginRoot, "skills", dirName);
    mkdirSync5(join6(targetDir, ".."), { recursive: true });
    cpSync(repoSkillDir, targetDir, { recursive: true });
  } else {
    const bundle = generatePluginSkillBundle(program);
    const skillMd = applyPluginSkillHint(program, bundle.skillMd);
    mkdirSync5(join6(pluginRoot, "skills", bundle.dirName), { recursive: true });
    writeFileSync4(join6(pluginRoot, "skills", bundle.dirName, "SKILL.md"), skillMd);
  }
}

// ../../src/mcp/zip.ts
function unixUxExtraField(uid, gid) {
  const uidBuf = Buffer.alloc(4);
  uidBuf.writeUInt32LE(uid >>> 0, 0);
  const gidBuf = Buffer.alloc(4);
  gidBuf.writeUInt32LE(gid >>> 0, 0);
  const payload = Buffer.concat([Buffer.from([1, 4]), uidBuf, Buffer.from([4]), gidBuf]);
  const header = Buffer.alloc(4);
  header.writeUInt16LE(30837, 0);
  header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}
function unixUpExtraField(unixMode) {
  const payload = Buffer.alloc(5);
  payload.writeUInt8(1, 0);
  payload.writeUInt32LE(unixMode >>> 0, 1);
  const header = Buffer.alloc(4);
  header.writeUInt16LE(30805, 0);
  header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}
function unixExtraFields(unixMode) {
  const { uid, gid } = defaultUnixIds();
  return Buffer.concat([unixUpExtraField(unixMode), unixUxExtraField(uid, gid)]);
}
function defaultUnixIds() {
  const uid = typeof process.getuid === "function" ? process.getuid() : 501;
  const gid = typeof process.getgid === "function" ? process.getgid() : 20;
  return { uid, gid };
}
function crc32(data) {
  let crc = 4294967295;
  for (let i = 0;i < data.length; i++) {
    const byte = data[i];
    if (byte === undefined) {
      continue;
    }
    crc ^= byte;
    for (let j = 0;j < 8; j++) {
      crc = crc >>> 1 ^ (crc & 1 ? 3988292384 : 0);
    }
  }
  return (crc ^ 4294967295) >>> 0;
}
function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const unixMode = file.unixMode;
    const extra = unixMode !== undefined ? unixExtraFields(unixMode) : Buffer.alloc(0);
    const local = Buffer.alloc(30 + nameBuf.length + extra.length);
    local.writeUInt32LE(67324752, 0);
    local.writeUInt16LE(unixMode !== undefined ? 10 : 20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt32LE(nameBuf.length, 26);
    local.writeUInt16LE(extra.length, 28);
    nameBuf.copy(local, 30);
    extra.copy(local, 30 + nameBuf.length);
    const centralHdr = Buffer.alloc(46 + nameBuf.length + extra.length);
    centralHdr.writeUInt32LE(33639248, 0);
    centralHdr.writeUInt16LE(unixMode !== undefined ? 798 : 20, 4);
    centralHdr.writeUInt16LE(unixMode !== undefined ? 10 : 20, 6);
    centralHdr.writeUInt16LE(0, 8);
    centralHdr.writeUInt16LE(0, 10);
    centralHdr.writeUInt16LE(0, 12);
    centralHdr.writeUInt16LE(0, 14);
    centralHdr.writeUInt32LE(crc, 16);
    centralHdr.writeUInt32LE(file.data.length, 20);
    centralHdr.writeUInt32LE(file.data.length, 24);
    centralHdr.writeUInt32LE(nameBuf.length, 28);
    centralHdr.writeUInt16LE(extra.length, 30);
    centralHdr.writeUInt16LE(0, 32);
    centralHdr.writeUInt16LE(0, 34);
    centralHdr.writeUInt16LE(0, 36);
    if (unixMode !== undefined) {
      const externalAttr = unixMode << 16 >>> 0;
      centralHdr.writeUInt32LE(externalAttr, 38);
    } else {
      centralHdr.writeUInt32LE(0, 38);
    }
    centralHdr.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHdr, 46);
    extra.copy(centralHdr, 46 + nameBuf.length);
    parts.push(local, file.data);
    central.push(centralHdr);
    offset += local.length + file.data.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(101010256, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

// ../../src/mcp/claude.ts
var DIST_DIR = "dist";
var CLAUDE_PLUGIN_DIR = "claude-plugin";
function defaultClaudePluginPaths(program, cwd = process.cwd()) {
  const binaryName = program.key;
  const dist = join7(cwd, DIST_DIR);
  const name = pluginName(program);
  return {
    pluginZipPath: join7(dist, CLAUDE_PLUGIN_DIR, `${name}.zip`),
    binaryPath: join7(dist, binaryName),
    binaryName
  };
}
function generatePluginManifest(program, _binaryName) {
  const bundle = program.mcpServer?.bundle;
  const manifest = {
    name: pluginName(program),
    version: program.version,
    description: program.description,
    author: defaultAuthor(bundle),
    mcpServers: ".mcp.json"
  };
  const userConfig = buildProgramUserConfig(program);
  if (userConfig) {
    manifest.userConfig = userConfig;
  }
  return manifest;
}
function generatePluginMcpJson(program, binaryName) {
  const mcp = {
    command: `\${CLAUDE_PLUGIN_ROOT}/bin/${binaryName}`,
    args: ["mcp"]
  };
  const env = buildPluginMcpEnvMapping(program);
  if (env) {
    mcp.env = env;
  }
  return {
    [mcpServerId(program)]: mcp
  };
}
function writePluginTree(pluginRoot, program, binaryPath, binaryName, cwd) {
  mkdirSync6(join7(pluginRoot, ".claude-plugin"), { recursive: true });
  mkdirSync6(join7(pluginRoot, "bin"), { recursive: true });
  writeFileSync5(join7(pluginRoot, ".claude-plugin", "plugin.json"), `${JSON.stringify(generatePluginManifest(program, binaryName), null, 2)}
`);
  writeFileSync5(join7(pluginRoot, ".mcp.json"), `${JSON.stringify(generatePluginMcpJson(program, binaryName), null, 2)}
`);
  cpSync2(binaryPath, join7(pluginRoot, "bin", binaryName), { mode: 493 });
  stagePluginSkills(pluginRoot, program, cwd);
}
function packClaudePlugin(program, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const defaults = defaultClaudePluginPaths(program, cwd);
  const mcpDefaults = defaultMcpBundlePaths(program, cwd);
  const binaryPath = resolve2(cwd, opts.binaryPath ?? mcpDefaults.binaryPath);
  const pluginZipPath = resolve2(cwd, defaults.pluginZipPath);
  const binaryName = basename(binaryPath);
  if (!existsSync8(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}. Build with compile first (expected dist/${program.key}).`);
  }
  const staging = mkdtempSync(join7(tmpdir(), "claude-plugin-"));
  try {
    writePluginTree(staging, program, binaryPath, binaryName, cwd);
    const zip = zipStore(collectZipEntries(staging));
    mkdirSync6(join7(pluginZipPath, ".."), { recursive: true });
    writeFileSync5(pluginZipPath, zip);
    return pluginZipPath;
  } finally {
    rmSync3(staging, { recursive: true, force: true });
  }
}

// ../../src/mcp/cursor.ts
import { cpSync as cpSync3, existsSync as existsSync9, mkdirSync as mkdirSync7, mkdtempSync as mkdtempSync2, rmSync as rmSync4, writeFileSync as writeFileSync6 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { basename as basename2, join as join8, resolve as resolve3 } from "node:path";
var DIST_DIR2 = "dist";
var CURSOR_PLUGIN_DIR = "cursor-plugin";
function defaultCursorPluginPaths(program, cwd = process.cwd()) {
  const binaryName = program.key;
  const dist = join8(cwd, DIST_DIR2);
  const name = pluginName(program);
  return {
    pluginZipPath: join8(dist, CURSOR_PLUGIN_DIR, `${name}.zip`),
    binaryPath: join8(dist, binaryName),
    binaryName
  };
}
function generateCursorPluginManifest(program, _binaryName) {
  const bundle = program.mcpServer?.bundle;
  const manifest = {
    name: pluginName(program),
    version: program.version,
    description: program.description,
    author: defaultAuthor(bundle)
  };
  if (bundle?.displayName) {
    manifest.displayName = bundle.displayName;
  }
  if (bundle?.homepage) {
    manifest.homepage = bundle.homepage;
  }
  if (bundle?.repository) {
    manifest.repository = bundle.repository;
  }
  if (bundle?.license) {
    manifest.license = bundle.license;
  }
  const variables = buildCursorPluginVariables(program);
  if (variables) {
    manifest.variables = variables;
  }
  return manifest;
}
function generateCursorPluginMcpJson(program, binaryName) {
  const mcp = {
    command: `\${CURSOR_PLUGIN_ROOT}/bin/${binaryName}`,
    args: ["mcp"]
  };
  const env = buildCursorPluginMcpEnvMapping(program);
  if (env) {
    mcp.env = env;
  }
  return {
    mcpServers: {
      [mcpServerId(program)]: mcp
    }
  };
}
function writePluginTree2(pluginRoot, program, binaryPath, binaryName, cwd) {
  mkdirSync7(join8(pluginRoot, ".cursor-plugin"), { recursive: true });
  mkdirSync7(join8(pluginRoot, "bin"), { recursive: true });
  writeFileSync6(join8(pluginRoot, ".cursor-plugin", "plugin.json"), `${JSON.stringify(generateCursorPluginManifest(program, binaryName), null, 2)}
`);
  writeFileSync6(join8(pluginRoot, "mcp.json"), `${JSON.stringify(generateCursorPluginMcpJson(program, binaryName), null, 2)}
`);
  cpSync3(binaryPath, join8(pluginRoot, "bin", binaryName), { mode: 493 });
  stagePluginSkills(pluginRoot, program, cwd);
}
function packCursorPlugin(program, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const defaults = defaultCursorPluginPaths(program, cwd);
  const mcpDefaults = defaultMcpBundlePaths(program, cwd);
  const binaryPath = resolve3(cwd, opts.binaryPath ?? mcpDefaults.binaryPath);
  const pluginZipPath = resolve3(cwd, defaults.pluginZipPath);
  const binaryName = basename2(binaryPath);
  if (!existsSync9(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}. Build with compile first (expected dist/${program.key}).`);
  }
  const staging = mkdtempSync2(join8(tmpdir2(), "cursor-plugin-"));
  try {
    writePluginTree2(staging, program, binaryPath, binaryName, cwd);
    const zip = zipStore(collectZipEntries(staging));
    mkdirSync7(join8(pluginZipPath, ".."), { recursive: true });
    writeFileSync6(pluginZipPath, zip);
    return pluginZipPath;
  } finally {
    rmSync4(staging, { recursive: true, force: true });
  }
}

// ../../src/mcp/bundle.ts
var MANIFEST_VERSION = "0.3";
var DIST_DIR3 = "dist";
function defaultMcpBundlePaths(program, cwd = process.cwd()) {
  const binaryName = program.key;
  const dist = join9(cwd, DIST_DIR3);
  return {
    binaryName,
    binaryPath: join9(dist, binaryName),
    outPath: join9(dist, `${binaryName}.mcpb`)
  };
}
function buildUserConfig(program) {
  return buildProgramUserConfig(program);
}
function defaultAuthor2(bundle) {
  return bundle?.author ?? { name: "Unknown" };
}
function generateMcpManifest(program, binaryName) {
  const bundle = program.mcpServer?.bundle;
  const tools = collectMcpTools(program).map((t) => ({
    name: t.name,
    description: t.description.split(`
`)[0] ?? t.description
  }));
  const manifest = {
    manifest_version: MANIFEST_VERSION,
    name: mcpServerId(program),
    version: program.version,
    description: program.description,
    author: defaultAuthor2(bundle),
    server: {
      type: "binary",
      entry_point: binaryName,
      mcp_config: {
        command: `\${__dirname}/${binaryName}`,
        args: ["mcp"]
      }
    },
    tools,
    tools_generated: false,
    compatibility: {
      claude_desktop: ">=0.10.0",
      platforms: ["darwin"]
    }
  };
  const longDescription = bundle?.longDescription ?? program.description;
  if (longDescription !== program.description) {
    manifest.long_description = longDescription;
  }
  const userConfig = buildUserConfig(program);
  if (userConfig) {
    manifest.user_config = userConfig;
  }
  if (bundle?.icon) {
    manifest.icon = basename3(bundle.icon);
  }
  return manifest;
}
function packMcpBundle(program, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const defaults = defaultMcpBundlePaths(program, cwd);
  const binaryPath = resolve4(cwd, opts.binaryPath ?? defaults.binaryPath);
  const outPath = resolve4(cwd, opts.outPath ?? defaults.outPath);
  const binaryName = basename3(binaryPath);
  if (!existsSync10(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}. Build with compile first (expected dist/${program.key}).`);
  }
  const staging = mkdtempSync3(join9(tmpdir3(), "mcpb-"));
  try {
    const stagedBinary = join9(staging, binaryName);
    cpSync4(binaryPath, stagedBinary, { mode: 493 });
    const manifest = generateMcpManifest(program, binaryName);
    const files = [
      {
        name: "manifest.json",
        data: Buffer.from(`${JSON.stringify(manifest, null, 2)}
`, "utf8")
      },
      { name: binaryName, data: readFileSync4(stagedBinary) }
    ];
    const iconRel = program.mcpServer?.bundle?.icon;
    if (iconRel) {
      const iconSrc = resolve4(cwd, iconRel);
      if (!existsSync10(iconSrc)) {
        throw new Error(`Bundle icon not found: ${iconRel}`);
      }
      const iconName = basename3(iconRel);
      files.push({ name: iconName, data: readFileSync4(iconSrc) });
    }
    mkdirSync8(join9(outPath, ".."), { recursive: true });
    writeFileSync7(outPath, zipStore(files));
    return outPath;
  } finally {
    rmSync5(staging, { recursive: true, force: true });
  }
}
function runMcpBundle(program) {
  const mcp = program.mcpServer;
  if (!mcp?.mcpd && !mcp?.claudePlugin && !mcp?.cursorPlugin) {
    throw new Error("mcp bundle: enable mcpServer.mcpd, mcpServer.claudePlugin, and/or mcpServer.cursorPlugin on the program root.");
  }
  const lines = [];
  if (mcp.mcpd) {
    lines.push(packMcpBundle(program));
  }
  if (mcp.claudePlugin) {
    lines.push(packClaudePlugin(program));
  }
  if (mcp.cursorPlugin) {
    lines.push(packCursorPlugin(program));
  }
  process.stdout.write(`${lines.join(`
`)}
`);
}
// ../../src/runtime/cli.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { format as format2 } from "node:util";

// ../../src/server/overrides.ts
import { join as join10 } from "node:path";
function resolveLogFile(program, logFile) {
  if (!logFile) {
    return;
  }
  if (logFile.startsWith("/") || logFile.startsWith("~")) {
    return logFile;
  }
  return join10(resolveAppConfigDir(program), logFile);
}
function resolveHttpServeConfig(program, overrides = {}) {
  const http = program.httpServer;
  const obscureUnexpected = overrides.obscureErrors ?? http?.errors?.obscureUnexpected ?? false;
  return {
    hostname: overrides.host ?? http?.host ?? "127.0.0.1",
    port: overrides.port ?? http?.port ?? 3000,
    trustProxy: overrides.trustProxy ?? http?.trustProxy ?? false,
    obscureUnexpected,
    log: {
      format: overrides.logFormat ?? program.log?.format ?? "json",
      file: resolveLogFile(program, overrides.logFile ?? program.log?.file),
      access: overrides.noAccessLog ? false : program.log?.access ?? true,
      errors: program.log?.errors ?? true,
      dev: overrides.dev ?? false
    }
  };
}
function resolveMcpServeConfig(program, overrides = {}) {
  const mcp = program.mcpServer;
  return {
    obscureUnexpected: overrides.obscureErrors ?? mcp?.errors?.obscureUnexpected ?? false,
    log: {
      format: overrides.logFormat ?? program.log?.format ?? "json",
      file: resolveLogFile(program, overrides.logFile ?? program.log?.file),
      access: program.log?.access ?? true,
      errors: program.log?.errors ?? true,
      dev: overrides.dev ?? false
    }
  };
}
function serveOverridesFromOpts(opts, surface) {
  const out = {};
  if (opts.host) {
    out.host = opts.host;
  }
  if (opts.port) {
    const port = Number(opts.port);
    if (!Number.isNaN(port)) {
      out.port = port;
    }
  }
  if (opts["trust-proxy"]) {
    out.trustProxy = true;
  }
  if (opts["obscure-errors"]) {
    out.obscureErrors = true;
  }
  if (opts["log-format"] === "json" || opts["log-format"] === "text") {
    out.logFormat = opts["log-format"];
  }
  if (opts["log-file"]) {
    out.logFile = opts["log-file"];
  }
  if (opts["no-access-log"] && surface === "http") {
    out.noAccessLog = true;
  }
  if (opts.dev) {
    out.dev = true;
  }
  return out;
}

// ../../src/builtins/shell-helpers.ts
function identToken(s) {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}
function escShellSingleQuoted(s) {
  return s.replace(/'/g, "'\\''");
}
function escFishSingleQuoted(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function mainName(schemaName) {
  return schemaName.replace(/[^a-zA-Z0-9]/g, "_");
}
var kHelpLong = "--help";
var kHelpShort = "-h";

// ../../src/builtins/completion-simulate-shared.ts
function emitConsumeLong(ident, scopes) {
  let o = "_${ident}_nac_consume_long() {\n".replace("${ident}", ident);
  o += `  local sid="$1" w="$2" nw="$3"
`;
  o += `  case $sid in
`;
  for (const [i, sc] of scopes.entries()) {
    o += `    ${i})
`;
    o += `      case $w in
`;
    o += "        " + kHelpLong + "|${kHelpLong}=*|${kHelpShort}) echo 1 ;;\n".replace(/\$\{kHelpLong\}/g, kHelpLong).replace(/\$\{kHelpShort\}/g, kHelpShort);
    for (const op of sc.opts) {
      const base = `--${op.name}`;
      if (op.kind === "presence") {
        o += `        ${base}${"|${base}=*) echo 1 ;;\n".replace(/\$\{base\}/g, base)}`;
      } else {
        o += `        ${base}=*) echo 1 ;;
`;
        o += `        ${base}) echo 2 ;;
`;
      }
    }
    o += `        *) echo 0 ;;
`;
    o += `      esac
`;
    o += `      ;;
`;
  }
  o += `    *) echo 0 ;;
`;
  o += `  esac
`;
  o += `}
`;
  return o;
}
function emitConsumeShort(ident, scopes, dialect) {
  const firstChar = dialect === "bash" ? "ch=${rest:0:1}" : "ch=${rest[1,1]}";
  const restAdvance = dialect === "bash" ? "rest=${rest:1}" : "rest=${rest[2,-1]}";
  let o = "_${ident}_nac_consume_short() {\n".replace("${ident}", ident);
  o += `  local sid="$1" w="$2"
`;
  o += `  case $sid in
`;
  for (const [i, sc] of scopes.entries()) {
    o += `    ${i})
`;
    o += "      local rest=${w#-}\n";
    o += `      local ch
`;
    o += `      local saw=0
`;
    o += `      while [[ -n $rest ]]; do
`;
    o += `        ${firstChar}
`;
    o += `        ${restAdvance}
`;
    o += `        case $ch in
`;
    let boolChars = "";
    for (const op of sc.opts) {
      if (!op.shortName)
        continue;
      if (op.kind === "presence") {
        boolChars += `${op.shortName}|`;
      } else {
        o += `          ${op.shortName})
`;
        o += `            if [[ $saw -ne 0 || -n $rest ]]; then echo 0; return; fi
`;
        o += `            echo 2; return ;;
`;
      }
    }
    if (boolChars.length > 0) {
      boolChars = boolChars.slice(0, -1);
      o += `          ${boolChars}) ;;
`;
    }
    o += `          *) echo 0; return ;;
`;
    o += `        esac
`;
    o += `        saw=1
`;
    o += `      done
`;
    o += `      echo 1
`;
    o += `      ;;
`;
  }
  o += `    *) echo 0 ;;
`;
  o += `  esac
`;
  o += `}
`;
  return o;
}
function emitMatchChild(ident, scopes, pathIndex) {
  let o = "_${ident}_nac_match_child() {\n".replace("${ident}", ident);
  o += `  local sid="$1" w="$2"
`;
  o += `  case $sid in
`;
  for (const [sid, sc] of scopes.entries()) {
    if (sc.kids.length === 0)
      continue;
    o += `    ${sid})
`;
    o += `      case $w in
`;
    for (const ch of sc.kids) {
      if (ch.key.startsWith(":")) {
        continue;
      }
      const childPath = sc.path === "" ? ch.key : `${sc.path}/${ch.key}`;
      const cid = pathIndex[childPath] ?? 0;
      o += `        ${ch.key}) echo ${cid}; return 0 ;;
`;
    }
    const paramChild = sc.kids.find((ch) => ch.key.startsWith(":"));
    if (paramChild) {
      const childPath = sc.path === "" ? paramChild.key : `${sc.path}/${paramChild.key}`;
      const cid = pathIndex[childPath] ?? 0;
      o += `        *) echo ${cid}; return 0 ;;
`;
    }
    o += `      esac
`;
    o += `      ;;
`;
  }
  o += `  esac
`;
  o += `  return 1
`;
  o += `}
`;
  return o;
}

// ../../src/builtins/scopes.ts
function hasPositionalArguments(cmd) {
  return isCliLeaf(cmd) && (cmd.positionals ?? []).length > 0;
}
function walkScopes(cmdPath, cmd, acc) {
  const kids = isCliRouter(cmd) ? cmd.commands : [];
  acc.push({
    kids,
    opts: cmd.options ?? [],
    path: cmdPath,
    wantsFiles: hasPositionalArguments(cmd)
  });
  for (const ch of kids) {
    const nextPath = cmdPath === "" ? ch.key : `${cmdPath}/${ch.key}`;
    walkScopes(nextPath, ch, acc);
  }
}
function collectScopes(schema) {
  const acc = [];
  acc.push({
    kids: schema.commands ?? [],
    opts: schema.options ?? [],
    path: "",
    wantsFiles: false
  });
  for (const c of schema.commands ?? []) {
    walkScopes(c.key, c, acc);
  }
  return acc;
}

// ../../src/builtins/completion-bash.ts
function emitSimulate(ident) {
  let o = "_${ident}_nac_simulate() {\n".replace("${ident}", ident);
  o += `  local i=1 sid=0 w steps next
`;
  o += `  while (( i < COMP_CWORD )); do
`;
  o += '    w="${COMP_WORDS[i]}"\n';
  o += `    if [[ $w == ${kHelpShort} || $w == ${kHelpLong} ]]; then
`;
  o += `      ((i++)); continue
`;
  o += `    fi
`;
  o += `    if [[ $w == --* ]]; then
`;
  o += '      steps=$(_${ident}_nac_consume_long "$sid" "$w" "${COMP_WORDS[i+1]}")\n'.replace("${ident}", ident);
  o += `      case $steps in
`;
  o += `        0) break ;;
`;
  o += `        1) ((i++)) ;;
`;
  o += `        2) ((i+=2)) ;;
`;
  o += `        *) break ;;
`;
  o += `      esac
`;
  o += `      continue
`;
  o += `    fi
`;
  o += `    if [[ $w == -* ]]; then
`;
  o += '      steps=$(_${ident}_nac_consume_short "$sid" "$w")\n'.replace("${ident}", ident);
  o += `      case $steps in
`;
  o += `        0) break ;;
`;
  o += `        1) ((i++)) ;;
`;
  o += `        2) ((i++)); break ;;
`;
  o += `        *) break ;;
`;
  o += `      esac
`;
  o += `      continue
`;
  o += `    fi
`;
  o += '    next=$(_${ident}_nac_match_child "$sid" "$w") || break\n'.replace("${ident}", ident);
  o += `    sid=$next
`;
  o += `    ((i++))
`;
  o += `  done
`;
  o += `  REPLY_SID=$sid
`;
  o += `}
`;
  return o;
}
function emitEnumReplyBash(ident, scopes) {
  let o = "_${ident}_nac_enum_reply() {\n".replace("${ident}", ident);
  o += `  local sid="$1" prev="$2" cur="$3"
`;
  o += `  case $sid in
`;
  for (const [i, sc] of scopes.entries()) {
    const enumOpts = sc.opts.filter((op) => op.kind === "enum" /* Enum */ && (op.choices?.length ?? 0) > 0);
    if (enumOpts.length === 0)
      continue;
    o += `    ${i})
`;
    o += `      case $prev in
`;
    for (const op of enumOpts) {
      const words = (op.choices ?? []).map((c) => escShellSingleQuoted(c)).join(" ");
      o += `        --${op.name}) COMPREPLY=( $(compgen -W '${words}' -- "$cur") ); return 0 ;;
`;
    }
    o += `      esac
`;
    o += `      ;;
`;
  }
  o += `  esac
`;
  o += `  return 1
`;
  o += `}
`;
  return o;
}
function emitMainBodyBash(schema, ident) {
  const main = mainName(schema.key);
  let o = "_${main}() {\n".replace("${main}", main);
  o += '  local cur="${COMP_WORDS[COMP_CWORD]}"\n';
  o += '  local prev="${COMP_WORDS[COMP_CWORD-1]:-}"\n';
  o += "  _${ident}_nac_simulate\n".replace("${ident}", ident);
  o += `  local sid=$REPLY_SID
`;
  o += '  if _${ident}_nac_enum_reply "$sid" "$prev" "$cur"; then return; fi\n'.replace("${ident}", ident);
  o += `  if [[ $cur == -* ]]; then
`;
  o += '    local oname="A_${ident}_${sid}_opts"\n'.replace("${ident}", ident);
  o += `    local -a optsarr
`;
  o += `    local -n optsref="$oname"
`;
  o += '    COMPREPLY=( $(compgen -W "${optsref[*]}" -- "$cur") )\n';
  o += `  else
`;
  o += '    local lname="A_${ident}_${sid}_leaf"\n'.replace("${ident}", ident);
  o += `    local -n leafref="$lname"
`;
  o += `    if [[ $leafref -eq 0 ]]; then
`;
  o += '      local cname="A_${ident}_${sid}_cmds"\n'.replace("${ident}", ident);
  o += `      local -a cmdsarr
`;
  o += `      local -n cmdsref="$cname"
`;
  o += '      COMPREPLY=( $(compgen -W "${cmdsref[*]}" -- "$cur") )\n';
  o += `    else
`;
  o += '      local pname="A_${ident}_${sid}_pos"\n'.replace("${ident}", ident);
  o += `      local -n posref="$pname"
`;
  o += `      if [[ $posref -eq 1 ]]; then
`;
  o += `        compopt -o filenames
`;
  o += `      fi
`;
  o += `    fi
`;
  o += `  fi
`;
  o += `}

`;
  o += "complete -F _${main} ${schema.key}\n".replace("${main}", main).replace("${schema.key}", schema.key);
  return o;
}
function completionBashScript(schema) {
  const ident = identToken(schema.key);
  const scopes = collectScopes(schema);
  const pathIndex = {};
  for (const [i, s] of scopes.entries()) {
    pathIndex[s.path] = i;
  }
  let out = `# Generated bash completion for ${schema.key}.

`;
  for (const [i, sc] of scopes.entries()) {
    out += `A_${ident}_${i}_opts=()
`;
    out += `A_${ident}_${i}_opts+=('${kHelpLong}' '${kHelpShort}')
`;
    for (const o of sc.opts) {
      out += `A_${ident}_${i}_opts+=('--${o.name}')
`;
      if (o.shortName) {
        out += `A_${ident}_${i}_opts+=('-${o.shortName}')
`;
      }
    }
    out += `A_${ident}_${i}_leaf=${sc.kids.length === 0 ? "1" : "0"}
`;
    out += `A_${ident}_${i}_pos=${sc.wantsFiles ? "1" : "0"}
`;
    if (sc.kids.length > 0) {
      out += `A_${ident}_${i}_cmds=(`;
      for (const ch of sc.kids) {
        out += ` '${ch.key}'`;
      }
      out += `)
`;
    }
  }
  out += emitConsumeLong(ident, scopes);
  out += emitConsumeShort(ident, scopes, "bash");
  out += emitMatchChild(ident, scopes, pathIndex);
  out += emitSimulate(ident);
  out += emitEnumReplyBash(ident, scopes);
  out += emitMainBodyBash(schema, ident);
  return out;
}

// ../../src/builtins/completion-fish.ts
function scopeCondition(ident, scopeIndex, path) {
  const fn = `__${ident}_scope_${scopeIndex}`;
  let body = `function ${fn}
`;
  body += `    set -l tokens (commandline -opc)
`;
  if (path === "") {
    body += `    test (count $tokens) -eq 0
`;
  } else {
    const parts = path.split("/");
    body += `    test (count $tokens) -eq ${parts.length}
`;
    for (let i = 0;i < parts.length; i++) {
      body += `    and test $tokens[${i + 1}] = ${parts[i]}
`;
    }
  }
  body += `end

`;
  return body;
}
function completionFishScript(schema) {
  const ident = identToken(schema.key);
  const app = schema.key;
  const scopes = collectScopes(schema);
  let out = `# Fish completion for ${app}

`;
  for (const [i, sc] of scopes.entries()) {
    out += scopeCondition(ident, i, sc.path);
    const cond = `__${ident}_scope_${i}`;
    for (const ch of sc.kids) {
      out += `complete -c ${app} -n '${cond}' -a '${escFishSingleQuoted(ch.key)}' -d '${escFishSingleQuoted(ch.description)}'
`;
    }
    out += `complete -c ${app} -n '${cond}' -s h -l help -d '${escFishSingleQuoted("Show help for this command.")}'
`;
    for (const op of sc.opts) {
      if (op.kind === "presence" /* Presence */) {
        const shortPart = op.shortName ? `-s ${op.shortName} ` : "";
        out += `complete -c ${app} -n '${cond}' ${shortPart}-l ${op.name} -d '${escFishSingleQuoted(op.description)}'
`;
      } else if (op.kind === "enum" /* Enum */ && (op.choices?.length ?? 0) > 0) {
        const shortPart = op.shortName ? `-s ${op.shortName} ` : "";
        out += `complete -c ${app} -n '${cond}' ${shortPart}-l ${op.name} -d '${escFishSingleQuoted(op.description)}'
`;
        const enumCond = `${cond}; and __fish_seen_argument -l ${op.name}`;
        for (const choice of op.choices ?? []) {
          out += `complete -c ${app} -n '${enumCond}' -a '${escFishSingleQuoted(choice)}'
`;
        }
      } else {
        const shortPart = op.shortName ? `-s ${op.shortName} ` : "";
        out += `complete -c ${app} -n '${cond}' ${shortPart}-l ${op.name} -d '${escFishSingleQuoted(op.description)}' -r
`;
      }
    }
    if (sc.wantsFiles && sc.kids.length === 0) {
      out += `complete -c ${app} -n '${cond}' -F
`;
    }
  }
  return out;
}

// ../../src/builtins/completion-zsh.ts
function emitScopeArraysZsh(ident, scopes) {
  let out = "";
  for (const [i, sc] of scopes.entries()) {
    out += `typeset -g A_${ident}_${i}_opts
`;
    out += `A_${ident}_${i}_opts=(`;
    out += "'" + escShellSingleQuoted(kHelpLong) + ":" + escShellSingleQuoted("Show help for this command.") + "' '" + escShellSingleQuoted(kHelpShort) + ":" + escShellSingleQuoted("Show help for this command.") + "'";
    for (const o of sc.opts) {
      out += ` '${escShellSingleQuoted(`--${o.name}`)}:${escShellSingleQuoted(o.description)}'`;
      if (o.shortName) {
        out += ` '${escShellSingleQuoted(`-${o.shortName}`)}:${escShellSingleQuoted(o.description)}'`;
      }
    }
    out += `)
`;
    out += `typeset -g A_${ident}_${i}_leaf=${sc.kids.length === 0 ? "1" : "0"}
`;
    out += `typeset -g A_${ident}_${i}_pos=${sc.wantsFiles ? "1" : "0"}
`;
    if (sc.kids.length > 0) {
      out += `typeset -g A_${ident}_${i}_cmds=(`;
      for (const ch of sc.kids) {
        out += ` '${escShellSingleQuoted(ch.key)}:${escShellSingleQuoted(ch.description)}'`;
      }
      out += `)
`;
    }
  }
  return out;
}
function emitSimulateZsh(ident) {
  let o = "_${ident}_nac_simulate() {\n".replace("${ident}", ident);
  o += `  local i=2 sid=0 w steps next
`;
  o += `  while (( i < CURRENT )); do
`;
  o += `    w=$words[i]
`;
  o += `    if [[ $w == ${kHelpShort} || $w == ${kHelpLong} ]]; then
`;
  o += `      ((i++)); continue
`;
  o += `    fi
`;
  o += `    if [[ $w == --* ]]; then
`;
  o += '      steps=$(_${ident}_nac_consume_long "$sid" "$w" "${words[i+1]}")\n'.replace("${ident}", ident);
  o += `      case $steps in
`;
  o += `        0) break ;;
`;
  o += `        1) ((i++)) ;;
`;
  o += `        2) ((i+=2)) ;;
`;
  o += `        *) break ;;
`;
  o += `      esac
`;
  o += `      continue
`;
  o += `    fi
`;
  o += `    if [[ $w == -* ]]; then
`;
  o += '      steps=$(_${ident}_nac_consume_short "$sid" "$w")\n'.replace("${ident}", ident);
  o += `      case $steps in
`;
  o += `        0) break ;;
`;
  o += `        1) ((i++)) ;;
`;
  o += `        2) ((i++)); break ;;
`;
  o += `        *) break ;;
`;
  o += `      esac
`;
  o += `      continue
`;
  o += `    fi
`;
  o += '    next=$(_${ident}_nac_match_child "$sid" "$w") || break\n'.replace("${ident}", ident);
  o += `    sid=$next
`;
  o += `    ((i++))
`;
  o += `  done
`;
  o += `  REPLY_SID=$sid
`;
  o += `}
`;
  return o;
}
function emitEnumReplyZsh(ident, scopes) {
  let o = "_${ident}_nac_enum_reply() {\n".replace("${ident}", ident);
  o += `  local sid=$1 prev=$2
`;
  o += `  case $sid in
`;
  for (const [i, sc] of scopes.entries()) {
    const enumOpts = sc.opts.filter((op) => op.kind === "enum" /* Enum */ && (op.choices?.length ?? 0) > 0);
    if (enumOpts.length === 0)
      continue;
    o += `    ${i})
`;
    o += `      case $prev in
`;
    for (const op of enumOpts) {
      const vals = (op.choices ?? []).map((c) => escShellSingleQuoted(c)).join(" ");
      o += `        --${op.name}) _values ${vals}; return 0 ;;
`;
    }
    o += `      esac
`;
    o += `      ;;
`;
  }
  o += `  esac
`;
  o += `  return 1
`;
  o += `}
`;
  return o;
}
function emitMainBodyZsh(schema, ident) {
  const main = mainName(schema.key);
  let o = "_${main}() {\n".replace("${main}", main);
  o += `  local curcontext="$curcontext" ret=1
`;
  o += "  _${ident}_nac_simulate\n".replace("${ident}", ident);
  o += `  local sid=$REPLY_SID
`;
  o += '  if _${ident}_nac_enum_reply "$sid" "$words[CURRENT-1]"; then return 0; fi\n'.replace("${ident}", ident);
  o += `  if [[ $PREFIX == -* ]]; then
`;
  o += `    local -a optsarr
`;
  o += '    local oname="A_${ident}_${sid}_opts"\n'.replace("${ident}", ident);
  o += "    optsarr=(${(@P)oname})\n";
  o += `    _describe -t options 'option' optsarr && ret=0
`;
  o += `  else
`;
  o += '    local lname="A_${ident}_${sid}_leaf"\n'.replace("${ident}", ident);
  o += "    if [[ ${(P)lname} -eq 0 ]]; then\n";
  o += `      local -a cmdsarr
`;
  o += '      local cname="A_${ident}_${sid}_cmds"\n'.replace("${ident}", ident);
  o += "      cmdsarr=(${(@P)cname})\n";
  o += `      _describe -t commands 'command' cmdsarr && ret=0
`;
  o += `    else
`;
  o += '      local pname="A_${ident}_${sid}_pos"\n'.replace("${ident}", ident);
  o += "      if [[ ${(P)pname} -eq 1 ]]; then\n";
  o += `        _files && ret=0
`;
  o += `      fi
`;
  o += `    fi
`;
  o += `  fi
`;
  o += `  return ret
`;
  o += `}

`;
  o += "compdef _${main} ${schema.key}\n".replace("${main}", main).replace("${schema.key}", schema.key);
  return o;
}
function completionZshScript(schema) {
  const ident = identToken(schema.key);
  const scopes = collectScopes(schema);
  const pathIndex = {};
  for (const [i, s] of scopes.entries()) {
    pathIndex[s.path] = i;
  }
  let out = `#compdef ${schema.key}

`;
  out += emitScopeArraysZsh(ident, scopes);
  out += emitConsumeLong(ident, scopes);
  out += emitConsumeShort(ident, scopes, "zsh");
  out += emitMatchChild(ident, scopes, pathIndex);
  out += emitSimulateZsh(ident);
  out += emitEnumReplyZsh(ident, scopes);
  out += emitMainBodyZsh(schema, ident);
  return out;
}

// ../../src/builtins/presentation.ts
function parseBuiltins(program, caps) {
  return resolveBuiltins(program, caps);
}
function presentationBuiltins(program, caps) {
  return parseBuiltins(program, caps).filter((b) => !isCliHidden(b));
}
function cliParseRoot(program) {
  const caps = resolveCapabilities(program);
  const builtins = parseBuiltins(program, caps);
  if (isCliLeaf(program)) {
    return {
      key: program.key,
      description: program.description,
      notes: program.notes,
      options: program.options,
      commands: builtins
    };
  }
  return {
    key: program.key,
    description: program.description,
    notes: program.notes,
    options: program.options,
    fallbackCommand: program.fallbackCommand,
    fallbackMode: program.fallbackMode,
    commands: [...program.commands, ...builtins]
  };
}
function cliPresentationRoot(program) {
  const caps = resolveCapabilities(program);
  const builtins = presentationBuiltins(program, caps);
  const notes = presentationRootNotes(program, caps);
  if (isCliLeaf(program)) {
    return {
      key: program.key,
      description: program.description,
      notes,
      options: visibleOptions(program.options),
      commands: builtins
    };
  }
  const userCommands = program.commands.map((ch) => presentationNode(ch)).filter((ch) => ch !== null);
  return {
    key: program.key,
    description: program.description,
    notes,
    options: visibleOptions(program.options),
    fallbackCommand: program.fallbackCommand,
    fallbackMode: program.fallbackMode,
    commands: [...userCommands, ...builtins]
  };
}
function presentationRootNotes(program, _caps) {
  const parts = [];
  if ((program.notes ?? "").trim().length > 0) {
    parts.push((program.notes ?? "").trim());
  }
  if (parts.length === 0) {
    return;
  }
  return parts.join(`

`);
}

// ../../src/builtins/dispatch.ts
function completionSchema(program, opts) {
  if (opts.isLeafCompletionIntercept) {
    return cliPresentationRoot(program);
  }
  return opts.parseRoot;
}
async function dispatchBuiltin(program, pr, opts) {
  if (pr.kind !== "ok" /* Ok */) {
    return;
  }
  const caps = resolveCapabilities(program);
  if (pr.path[0] === "completion") {
    if (!caps.completion) {
      process.stderr.write(capabilityDeniedMessage("completion"));
      process.exit(1);
    }
    const schemaForCompletion = completionSchema(program, opts);
    if (pr.path[1] === "bash") {
      process.stdout.write(completionBashScript(schemaForCompletion));
      process.exit(0);
    }
    if (pr.path[1] === "zsh") {
      process.stdout.write(completionZshScript(schemaForCompletion));
      process.exit(0);
    }
    if (pr.path[1] === "fish") {
      process.stdout.write(completionFishScript(schemaForCompletion));
      process.exit(0);
    }
    return;
  }
  if (pr.path[0] === "version") {
    if (pr.path.length !== 1) {
      process.stderr.write(`Unknown subcommand: version ${pr.path.slice(1).join(" ")}
`);
      process.exit(1);
    }
    process.stdout.write(`${program.version}
`);
    process.exit(0);
  }
  if (pr.path[0] === "http") {
    if (!caps.http) {
      process.stderr.write(capabilityDeniedMessage("http"));
      process.exit(1);
    }
    const sub = pr.path[1];
    if (pr.path.length === 1 || sub === "serve") {
      await new Cli(program).serveHttp(serveOverridesFromOpts(pr.opts, "http"));
      process.exit(0);
    }
    process.stderr.write(`Unknown subcommand: http ${pr.path.slice(1).join(" ")}
`);
    process.exit(1);
  }
  if (pr.path[0] === "mcp") {
    if (!caps.mcp) {
      process.stderr.write(capabilityDeniedMessage("mcp"));
      process.exit(1);
    }
    const sub = pr.path[1];
    if (pr.path.length === 1 || sub === "serve") {
      await new Cli(program).serveMcp(serveOverridesFromOpts(pr.opts, "mcp"));
      process.exit(0);
    }
    if (pr.path.length === 2 && sub === "bundle") {
      try {
        runMcpBundle(program);
      } catch (err) {
        process.stderr.write(err instanceof Error ? `${err.message}
` : `mcp bundle failed.
`);
        process.exit(1);
      }
      process.exit(0);
    }
    process.stderr.write(`Unknown subcommand: mcp ${pr.path.slice(1).join(" ")}
`);
    process.exit(1);
  }
  if (pr.path[0] === "configure") {
    if (!caps.configure) {
      process.stderr.write(capabilityDeniedMessage("configure"));
      process.exit(1);
    }
    if (isConfigureConfigPath(pr.path)) {
      return;
    }
  }
}
function builtinInterceptRoot(program, argv) {
  if (!isCliLeaf(program) || argv.length < 1) {
    return { parseRoot: program, isLeafCompletionIntercept: false };
  }
  const caps = resolveCapabilities(program);
  const first = argv[0];
  if (first === "completion") {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinCompletionGroup(program)]
      },
      isLeafCompletionIntercept: true
    };
  }
  if (first === "configure" && caps.configure) {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinConfigureCommand(program)]
      },
      isLeafCompletionIntercept: false
    };
  }
  if (first === "http" && caps.http) {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinHttpCommand(program)]
      },
      isLeafCompletionIntercept: false
    };
  }
  if (first === "mcp" && caps.mcp) {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinMcpCommand(program)]
      },
      isLeafCompletionIntercept: false
    };
  }
  if (first === "version") {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinVersionCommand()]
      },
      isLeafCompletionIntercept: false
    };
  }
  const docsGroup = cliBuiltinDocsGroupIfEnabled(program);
  if (first === "docs" && docsGroup) {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [docsGroup]
      },
      isLeafCompletionIntercept: false
    };
  }
  return { parseRoot: program, isLeafCompletionIntercept: false };
}

// ../../src/core/validate.ts
function validateDocsConfig(docs) {
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
function validateConfigBlock(appConfigBlock) {
  const entries = appConfigBlock.entries;
  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
    throw new CliSchemaValidationError("program.appConfig.entries must be an object");
  }
  const envNames = new Set;
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
        throw new CliSchemaValidationError(`program.appConfig.entries['${key}'].env must be a non-empty string when set`);
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
      throw new CliSchemaValidationError("program.appConfig.jsonSchema must be a JSON Schema object (not null or an array)");
    }
    const properties = jsonSchema.properties;
    if (properties !== undefined) {
      if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
        throw new CliSchemaValidationError("program.appConfig.jsonSchema.properties must be an object when set");
      }
      for (const key of Object.keys(entries)) {
        if (!(key in properties)) {
          throw new CliSchemaValidationError(`program.appConfig.entries key '${key}' is missing from jsonSchema.properties`);
        }
      }
    }
  }
}
function validateConfigureConfig(program) {
  const configure = program.configure;
  if (!configure)
    return;
  if ("prefix" in configure) {
    throw new CliSchemaValidationError("configure.prefix removed; app binary installs via Homebrew");
  }
  if ("agentIntegration" in configure) {
    throw new CliSchemaValidationError("configure.agentIntegration removed; skills are authored under skills/<app>/SKILL.md");
  }
  if (!configure.targets)
    return;
  const targets = configure.targets;
  if ("allSkills" in targets || "allMcps" in targets) {
    throw new CliSchemaValidationError("configure.targets.allSkills/allMcps removed; use per-key targets");
  }
  const legacySkillKeys = ["cursorSkill", "claudeSkill", "codexSkill", "opencodeSkill", "openclawSkill"];
  for (const key of legacySkillKeys) {
    if (key in targets) {
      throw new CliSchemaValidationError(`configure.targets.${key} removed; skills are authored under skills/<app>/SKILL.md`);
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
    "agentsMcp"
  ];
  for (const key of legacyMcpKeys) {
    if (key in targets) {
      throw new CliSchemaValidationError(`configure.targets.${key} removed; MCP installs to ~/.agents/mcp.json when mcpServer.enabled`);
    }
  }
  const allowedKeys = new Set(["app", "configure"]);
  for (const key of Object.keys(targets)) {
    if (!allowedKeys.has(key)) {
      throw new CliSchemaValidationError(`configure.targets.${key} is not a valid target key`);
    }
  }
}
function cliValidateProgram(program) {
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
var PARAM_ROUTER_KEY = /^:[a-zA-Z][a-zA-Z0-9_]*$/;
function isParamRouterKey3(key) {
  return key.startsWith(":");
}
function validateHttpPathPrefix(program) {
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
      throw new CliSchemaValidationError(`httpServer.pathPrefix must not be a framework path (got ${JSON.stringify(raw)})`);
    }
    return;
  }
  if (!isCliRouter(program)) {
    if (isCliLeaf(program) && HTTP_RESERVED_TOP_LEVEL_SEGMENTS.has(program.key)) {
      throw new CliSchemaValidationError(`Reserved HTTP program key when httpServer.pathPrefix is empty: ${program.key}`);
    }
    return;
  }
  for (const child of program.commands) {
    if (HTTP_RESERVED_TOP_LEVEL_SEGMENTS.has(child.key)) {
      throw new CliSchemaValidationError(`Reserved HTTP command name when httpServer.pathPrefix is empty: ${child.key} (set httpServer.pathPrefix or rename)`);
    }
  }
}
function walkNode(node, program, isRoot) {
  if (!isRoot) {
    const rogue = node;
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
    if (isDocumentLeaf(node)) {
      const kindStr = `kind: "${node.kind ?? "document"}"`;
      if (node.inputSchema === undefined) {
        throw new CliSchemaValidationError(`${kindStr} requires inputSchema on ${node.key}`);
      }
      if ((node.options ?? []).length > 0) {
        throw new CliSchemaValidationError(`${kindStr} forbids options on ${node.key}`);
      }
      if ((node.positionals ?? []).length > 0) {
        throw new CliSchemaValidationError(`${kindStr} forbids positionals on ${node.key}`);
      }
    }
    const outputSchema = node.outputSchema;
    if (outputSchema !== undefined && (typeof outputSchema !== "object" || outputSchema === null || Array.isArray(outputSchema))) {
      throw new CliSchemaValidationError("outputSchema must be a JSON Schema object (not null or an array)");
    }
    const inputSchema = node.inputSchema;
    if (inputSchema !== undefined && (typeof inputSchema !== "object" || inputSchema === null || Array.isArray(inputSchema))) {
      throw new CliSchemaValidationError("inputSchema must be a JSON Schema object (not null or an array)");
    }
    if (inputSchema !== undefined) {
      const properties = inputSchema.properties;
      if (properties !== undefined && (typeof properties !== "object" || properties === null || Array.isArray(properties))) {
        throw new CliSchemaValidationError(`inputSchema.properties must be an object on ${node.key}`);
      }
      if (properties) {
        for (const opt of node.options ?? []) {
          if (opt.kind === "json" /* Json */ && !(opt.name in properties)) {
            throw new CliSchemaValidationError(`Json option '${opt.name}' is missing from inputSchema.properties on ${node.key}`);
          }
        }
      }
    }
  } else {
    const rogue = node;
    if (rogue.mcpTool !== undefined) {
      throw new CliSchemaValidationError(`mcpTool is only supported on leaf commands (not on ${node.key})`);
    }
  }
  if (isRoot && program.mcpServer?.enabled === true && program.mcpServer.resources) {
    const schemaUri = resolveMcpSchemaUri(program);
    const reserved = new Set([schemaUri, ...reservedDocsTopicResourceUris(program)]);
    const uris = program.mcpServer.resources.map((r) => r.uri);
    for (const uri2 of uris) {
      if (reserved.has(uri2)) {
        const kind = uri2 === schemaUri ? "built-in schema resource" : "auto docs topic resource";
        throw new CliSchemaValidationError(`mcpServer.resources URI '${uri2}' conflicts with ${kind}`);
      }
    }
    if (new Set(uris).size !== uris.length) {
      throw new CliSchemaValidationError("mcpServer.resources URIs must be unique");
    }
  }
  if (isCliRouter(node)) {
    if (!isRoot && (node.options ?? []).length > 0) {
      throw new CliSchemaValidationError(`Options on routing group '${node.key}' are not supported — declare options on leaf commands`);
    }
    const seenNames = new Set;
    let paramRouterCount = 0;
    for (const child of node.commands) {
      if (seenNames.has(child.key)) {
        throw new CliSchemaValidationError(`Duplicate command name: ${child.key}`);
      }
      seenNames.add(child.key);
      if (isParamRouterKey3(child.key)) {
        if (!PARAM_ROUTER_KEY.test(child.key)) {
          throw new CliSchemaValidationError(`Param router key '${child.key}' must match :[a-zA-Z][a-zA-Z0-9_]* on '${node.key}'`);
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
    const positionals = isCliLeaf(node) ? node.positionals ?? [] : [];
    validateOptions(node.key, node.options ?? []);
    validatePositionals(node.key, positionals);
  }
}
function validateOptions(scopeKey, options) {
  const seenShorts = new Set;
  let pipableCount = 0;
  for (const opt of options) {
    if (opt.pipable) {
      pipableCount++;
      if (opt.kind !== "json" /* Json */) {
        throw new CliSchemaValidationError(`pipable is only valid on Json kind: ${scopeKey}/${opt.name}`);
      }
    }
    if (opt.kind === "json" /* Json */) {
      if (opt.format !== undefined || opt.pattern !== undefined || opt.default !== undefined) {
        throw new CliSchemaValidationError(`Json option cannot use format, pattern, or default: ${scopeKey}/${opt.name}`);
      }
    }
    if (opt.required && opt.kind === "presence" /* Presence */) {
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
    if (opt.kind === "enum" /* Enum */) {
      if (!opt.choices || opt.choices.length === 0) {
        throw new CliSchemaValidationError(`Option '${opt.name}' on '${scopeKey}': Enum kind requires non-empty choices`);
      }
      if (new Set(opt.choices).size !== opt.choices.length) {
        throw new CliSchemaValidationError(`Option '${opt.name}' on '${scopeKey}': Enum choices must be distinct`);
      }
      for (const choice of opt.choices) {
        if (choice.length === 0) {
          throw new CliSchemaValidationError(`Option '${opt.name}' on '${scopeKey}': Enum choices must be non-empty strings`);
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
function validateOptionValueMetadata(scopeKey, opt) {
  const label = `${scopeKey}/${opt.name}`;
  if (opt.default !== undefined) {
    if (opt.kind === "presence" /* Presence */) {
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
    if (opt.kind !== "string" /* String */) {
      throw new CliSchemaValidationError(`Option ${label}: format is only valid on String kind`);
    }
    if (!Object.values(CliValueFormat).includes(opt.format)) {
      throw new CliSchemaValidationError(`Option ${label}: unknown format '${opt.format}'`);
    }
  }
  if (opt.pattern !== undefined) {
    if (opt.kind !== "string" /* String */) {
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
function validatePositionals(scopeKey, positionals) {
  for (const p of positionals) {
    if (p.argMin !== undefined && p.argMin < 0) {
      throw new CliSchemaValidationError(`argMin must be >= 0 for positional ${scopeKey}/${p.name}`);
    }
    if (p.argMax !== undefined && p.argMax < 0) {
      throw new CliSchemaValidationError(`argMax must be >= 0 (use 0 for unlimited) for positional ${scopeKey}/${p.name}`);
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
  for (let idx = 0;idx < positionals.length; idx++) {
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

// ../../src/hooks/builtin.ts
var BUILTIN_ROOTS = new Set(["completion", "version", "http", "mcp", "configure", "docs"]);
function isBuiltinInvokePath(path) {
  const root = path[0];
  if (!root || !BUILTIN_ROOTS.has(root)) {
    return false;
  }
  if (root === "http") {
    return path.length <= 1 || path[1] === "serve";
  }
  if (root === "mcp") {
    return path.length <= 1 || path[1] === "serve" || path[1] === "bundle";
  }
  return true;
}

// ../../src/mcp/env.ts
import { spawnSync } from "node:child_process";
function captureShellEnv(shell) {
  const result = spawnSync(shell, ["-l", "-c", "env"], {
    encoding: "utf8",
    timeout: 5000
  });
  if (result.error || result.status !== 0) {
    return {};
  }
  const env = {};
  for (const line of result.stdout.split(`
`)) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      env[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return env;
}
function applyShellEnv(env) {
  for (const [key, val] of Object.entries(env)) {
    if (key === "PATH") {
      const existing = process.env.PATH ?? "";
      const existingParts = new Set(existing.split(":"));
      const shellOnly = val.split(":").filter((p) => p.length > 0 && !existingParts.has(p));
      if (shellOnly.length > 0) {
        process.env.PATH = [...shellOnly, existing].join(":");
      }
    } else if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
function bootstrapMcpEnv(config) {
  if (config.shellEnv === false) {
    return;
  }
  const shellEnvCfg = config.shellEnv;
  const shell = typeof shellEnvCfg === "string" ? shellEnvCfg : process.env.SHELL ?? (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  const captured = captureShellEnv(shell);
  if (Object.keys(captured).length === 0) {
    process.stderr.write(`[argsbarg] shellEnv: failed to capture shell environment from ${shell}
`);
  } else {
    applyShellEnv(captured);
  }
}

// ../../src/mcp/server.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var MCP_PROTOCOL_VERSION = "2024-11-05";
function writeResponse(msg) {
  process.stdout.write(`${JSON.stringify(msg)}
`);
}
function writeError(id, code, message) {
  if (id === undefined) {
    return;
  }
  writeResponse({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}
async function handleRequestLine(cli, line) {
  const root = cli.program;
  const requestId = randomUUID2();
  const started = performance.now();
  const hooks = cli.server?.mcpHooks ?? root.mcpServer?.hooks;
  const emitter = cli.server?.emitter;
  const obscureUnexpected = cli.server?.mcp?.obscureUnexpected ?? root.mcpServer?.errors?.obscureUnexpected ?? false;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const id = req.id;
  const hasId = id !== undefined;
  const method = req.method ?? "";
  const params = req.params ?? {};
  const wireCtx = { rpcMethod: method, requestId };
  await hooks?.onRequest?.(wireCtx);
  const finish = async (failureKind, error) => {
    const durationMs = Math.round(performance.now() - started);
    if (failureKind && error !== undefined) {
      await hooks?.onError?.({
        ...wireCtx,
        failureKind,
        error
      });
    } else {
      await hooks?.onResponse?.({ ...wireCtx, durationMs });
    }
    emitter?.emitAccess({
      method: "MCP",
      path: method,
      status: failureKind ? 500 : 200,
      durationMs,
      requestId
    });
  };
  if (req.jsonrpc !== "2.0") {
    if (hasId) {
      writeError(id, -32600, "Invalid Request");
    }
    await finish("validation", new Error("Invalid Request"));
    return;
  }
  if (method === "notifications/initialized") {
    return;
  }
  if (!hasId) {
    return;
  }
  try {
    if (method === "initialize") {
      const info = resolveMcpServerInfo(root);
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: info.name, version: info.version }
        }
      });
      await finish();
      return;
    }
    if (method === "ping") {
      writeResponse({ jsonrpc: "2.0", id, result: {} });
      await finish();
      return;
    }
    if (method === "tools/list") {
      const tools = collectMcpTools(root).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...t.outputSchema === undefined ? {} : { outputSchema: t.outputSchema }
      }));
      writeResponse({ jsonrpc: "2.0", id, result: { tools } });
      await finish();
      return;
    }
    if (method === "tools/call") {
      const name = params.name;
      if (typeof name !== "string") {
        writeError(id, -32602, "Invalid params: name required");
        await finish("validation", new Error("Invalid params: name required"));
        return;
      }
      const rawArgs = params.arguments;
      if (rawArgs !== undefined && (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs))) {
        writeError(id, -32602, "Invalid params: arguments must be an object");
        await finish("validation", new Error("Invalid params: arguments must be an object"));
        return;
      }
      const lookup = lookupHeadlessTool(root, name);
      if (!lookup.ok) {
        if (lookup.kind === "unknown") {
          writeError(id, -32602, lookup.message);
          await finish("unknown_route", new Error(lookup.message));
          return;
        }
        writeResponse({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: lookup.message }],
            isError: true
          }
        });
        await finish("missing_config", new Error(lookup.message));
        return;
      }
      const invokeResult = await executeHeadlessToolCall(cli, lookup.tool, rawArgs ?? {}, "mcp", { rpcMethod: method, toolName: name, requestId });
      if (invokeResult.ok) {
        writeResponse({
          jsonrpc: "2.0",
          id,
          result: invokeResult.mcpResult
        });
        await finish();
        return;
      }
      const text = headlessFailureMcpMessage(invokeResult, obscureUnexpected);
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text }],
          isError: true
        }
      });
      await finish(invokeResult.failureKind ?? "invoke", new Error(invokeResult.message));
      return;
    }
    if (method === "resources/list") {
      const resources = allMcpResources(root).map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType
      }));
      writeResponse({ jsonrpc: "2.0", id, result: { resources } });
      await finish();
      return;
    }
    if (method === "resources/read") {
      const uri2 = params.uri;
      if (typeof uri2 !== "string") {
        writeError(id, -32602, "Invalid params: uri required");
        await finish("validation", new Error("Invalid params: uri required"));
        return;
      }
      const all = allMcpResources(root);
      const found = all.find((r) => r.uri === uri2);
      if (!found) {
        writeError(id, -32602, `Unknown resource: ${uri2}`);
        await finish("unknown_route", new Error(`Unknown resource: ${uri2}`));
        return;
      }
      let text;
      try {
        text = found.load();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeError(id, -32603, `Resource load failed: ${message}`);
        await finish("unexpected", err);
        return;
      }
      writeResponse({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri: found.uri,
              mimeType: found.mimeType,
              text
            }
          ]
        }
      });
      await finish();
      return;
    }
    writeError(id, -32601, "Method not found");
    await finish("unknown_route", new Error("Method not found"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    writeError(id, -32603, message);
    await finish("unexpected", err);
  }
}
async function mcpServeStdioLoop(cli) {
  let buffer = "";
  const decoder = new TextDecoder;
  for await (const chunk of process.stdin) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk);
    let nl = buffer.indexOf(`
`);
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length === 0) {
        nl = buffer.indexOf(`
`);
        continue;
      }
      await handleRequestLine(cli, line);
      nl = buffer.indexOf(`
`);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    await handleRequestLine(cli, trailing);
  }
}

// ../../src/server/context.ts
function createServerRuntime(program, surface) {
  return { state: {}, program, surface };
}

// ../../src/runtime/cli.ts
class CliInvokeExit extends Error {
  code;
  constructor(code) {
    super(`process.exit(${code})`);
    this.name = "CliInvokeExit";
    this.code = code;
  }
}

class Cli {
  program;
  caps;
  parseRootMerged;
  presentationRoot;
  _appConfig;
  server;
  constructor(program) {
    cliValidateProgram(program);
    Object.freeze(program);
    this.program = program;
    this.caps = resolveCapabilities(program);
    this.parseRootMerged = cliParseRoot(program);
    this.presentationRoot = cliPresentationRoot(program);
  }
  get appConfig() {
    if (this._appConfig === undefined) {
      this._appConfig = this.buildAppConfigSnapshot({
        exitOnMissing: false,
        interactive: false
      });
    }
    return this._appConfig;
  }
  exportCommandSchema() {
    return cliSchemaExport(this.program);
  }
  exportAppConfigSchema() {
    return effectiveJsonSchema(this.program);
  }
  async run(argv = process.argv.slice(2)) {
    assertBuiltinAllowed(argv, this.caps);
    const prep = this.prepareDispatch(argv);
    if ("error" in prep) {
      if (prep.error.kind === "help" /* Help */) {
        process.stdout.write(cliHelpRender(this.parseRootMerged, prep.error.helpPath, false));
        process.exit(prep.error.helpExplicit ? 0 : 1);
      }
      const color = process.stderr.isTTY;
      const msg = color ? `\x1B[31m${prep.error.errorMsg}\x1B[0m` : prep.error.errorMsg;
      process.stderr.write(`${msg}
`);
      process.stderr.write(cliHelpRender(this.presentationRoot, prep.error.errorHelpPath, true));
      process.exit(1);
    }
    const { pr, completionParseRoot, isLeafCompletionIntercept, leaf } = prep;
    if (pr.kind === "ok" /* Ok */) {
      await dispatchBuiltin(this.program, pr, {
        isLeafCompletionIntercept,
        parseRoot: completionParseRoot
      });
    }
    const skipRequiredConfig = skipsRequiredAppConfigExit(pr.path, this.caps);
    const snapshot = this.buildAppConfigSnapshot({
      interactive: !skipRequiredConfig && !!process.stdin.isTTY,
      exitOnMissing: !skipRequiredConfig
    });
    let preloadedJson = {};
    try {
      preloadedJson = await preloadPipableJson(this.program, pr.path, pr.opts, "cli", pr.args);
    } catch (err) {
      if (err instanceof LeafInputError) {
        this.exitLeafInputError(err, pr.path);
      }
      const msg = err instanceof Error ? err.message : String(err);
      const color = process.stderr.isTTY;
      process.stderr.write(color ? `\x1B[31m${msg}\x1B[0m
` : `${msg}
`);
      process.exit(1);
    }
    const ctx = new CliContext(this.program.key, pr.path, pr.args, pr.opts, this.program, "cli", snapshot, undefined, preloadedJson, pr.pathParams, { requestId: randomUUID3() });
    try {
      this.ensureValidatedLeafInputs(ctx, leaf);
      const handlerResult = await Promise.resolve(leaf.handler(ctx));
      if (handlerResult !== undefined && ctx.getResponse() === undefined) {
        ctx.respond({ body: handlerResult });
      }
      process.exit(0);
    } catch (err) {
      if (err instanceof LeafInputError) {
        this.exitLeafInputError(err, pr.path);
      }
      if (err instanceof Error) {
        process.stderr.write(`${err.message}
`);
      }
      process.exit(1);
    }
  }
  async invoke(argv, opts) {
    const invocation = opts?.invocation ?? "mcp";
    const prep = this.prepareDispatch(argv, { presentationFallback: true });
    if ("error" in prep) {
      if (prep.error.kind === "help" /* Help */) {
        return {
          kind: "help",
          exitCode: 1,
          stdout: "",
          stderr: "",
          errorMsg: "Help is not available via tool calls.",
          failureKind: "help"
        };
      }
      return {
        kind: "error",
        exitCode: 1,
        stdout: "",
        stderr: prep.error.errorMsg,
        errorMsg: prep.error.errorMsg,
        failureKind: "validation"
      };
    }
    const { pr, completionParseRoot, isLeafCompletionIntercept, leaf } = prep;
    const snapshot = this.buildAppConfigSnapshot({
      interactive: false,
      exitOnMissing: false
    });
    const runtime = this.server?.runtime;
    const requestId = opts?.requestId ?? opts?.http?.requestId ?? opts?.mcp?.requestId ?? randomUUID3();
    const ctx = new CliContext(this.program.key, pr.path, pr.args, pr.opts, this.program, invocation, snapshot, opts?.toolArgs, {}, pr.pathParams, { requestId }, runtime);
    const skipHooks = isBuiltinInvokePath(pr.path);
    const hooks = this.program.hooks;
    const obscureUnexpected = invocation === "http" ? this.server?.http?.obscureUnexpected ?? this.program.httpServer?.errors?.obscureUnexpected ?? false : invocation === "mcp" ? this.server?.mcp?.obscureUnexpected ?? this.program.mcpServer?.errors?.obscureUnexpected ?? false : false;
    const emitter = this.server?.emitter;
    const hookCtx = () => buildInvokeHookContext(ctx, {
      path: pr.path,
      runtime,
      http: opts?.http,
      mcp: opts?.mcp
    });
    let stdout = "";
    let stderr = "";
    const origExit = process.exit;
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    const origConsoleLog = console.log;
    const origConsoleError = console.error;
    const origConsoleInfo = console.info;
    const origConsoleWarn = console.warn;
    process.exit = (code) => {
      throw new CliInvokeExit(code ?? 0);
    };
    process.stdout.write = (chunk, ...args) => {
      stdout += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      if (typeof args[0] === "function") {
        args[0]();
      }
      return true;
    };
    process.stderr.write = (chunk, ...args) => {
      stderr += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      if (typeof args[0] === "function") {
        args[0]();
      }
      return true;
    };
    console.log = (...args) => {
      stdout += `${format2(...args)}
`;
    };
    console.info = (...args) => {
      stdout += `${format2(...args)}
`;
    };
    console.warn = (...args) => {
      stderr += `${format2(...args)}
`;
    };
    console.error = (...args) => {
      stderr += `${format2(...args)}
`;
    };
    const finishError = async (err, kindOpts) => {
      const failureKind = classifyFailureKind(err, kindOpts);
      if (!skipHooks) {
        const piped = await runErrorPipeline(hookCtx(), err, failureKind, hooks, emitter, obscureUnexpected);
        return {
          kind: "error",
          exitCode: piped.clientError.exitCode ?? 1,
          stdout,
          stderr: `${piped.errorMsg}
`,
          errorMsg: piped.errorMsg,
          failureKind: piped.failureKind
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        kind: "error",
        exitCode: 1,
        stdout,
        stderr: `${message}
`,
        errorMsg: message,
        failureKind
      };
    };
    try {
      if (pr.kind === "ok" /* Ok */) {
        await dispatchBuiltin(this.program, pr, {
          isLeafCompletionIntercept,
          parseRoot: completionParseRoot
        });
      }
      if (!skipHooks) {
        await runHook(() => hooks?.beforeInvoke?.(hookCtx()), "beforeInvoke");
      }
      this.ensureValidatedLeafInputs(ctx, leaf);
      const handlerResult = await Promise.resolve(leaf.handler(ctx));
      if (handlerResult !== undefined && ctx.getResponse() === undefined) {
        ctx.respond({ body: handlerResult });
      }
      const response = ctx.getResponse();
      const okResult = {
        kind: "ok",
        exitCode: 0,
        stdout,
        stderr,
        ...response ? { response } : {}
      };
      if (!skipHooks) {
        await runHook(() => hooks?.afterInvoke?.({ ...hookCtx(), result: okResult }), "afterInvoke");
      }
      return okResult;
    } catch (err) {
      if (err instanceof CliInvokeExit) {
        if (err.code === 0) {
          const response = ctx.getResponse();
          const okResult = {
            kind: "ok",
            exitCode: 0,
            stdout,
            stderr,
            ...response ? { response } : {}
          };
          if (!skipHooks) {
            await runHook(() => hooks?.afterInvoke?.({ ...hookCtx(), result: okResult }), "afterInvoke");
          }
          return okResult;
        }
        return finishError(err, {});
      }
      if (err instanceof LeafInputError) {
        return finishError(err, { parseError: true });
      }
      if (err instanceof Error) {
        return finishError(err, {});
      }
      return finishError(err, {});
    } finally {
      process.exit = origExit;
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
      console.log = origConsoleLog;
      console.error = origConsoleError;
      console.info = origConsoleInfo;
      console.warn = origConsoleWarn;
    }
  }
  async serveMcp(overrides = {}) {
    try {
      if (this.program.mcpServer) {
        bootstrapMcpEnv(this.program.mcpServer);
      }
      const resolved = resolveMcpServeConfig(this.program, overrides);
      const runtime = createServerRuntime(this.program, "mcp");
      const emitter = new LogEmitter({ program: this.program, resolved: resolved.log });
      this.server = {
        runtime,
        emitter,
        mcp: resolved,
        mcpHooks: this.program.mcpServer?.hooks
      };
      bootstrapAppConfig(this.program, { validateFile: "soft", runtime, emitter });
      const shutdown = () => {
        emitter.emit({ level: "info", message: "server stopping", action: "server.stop" });
        process.exit(0);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      emitter.emitLifecycle(`${this.program.key} ${this.program.version} — MCP ready (stdio)`, "mcp.server.ready");
      await mcpServeStdioLoop(this);
      process.exit(0);
    } catch (err) {
      if (err instanceof Error) {
        process.stderr.write(`${err.message}
`);
      } else {
        process.stderr.write(`MCP server error.
`);
      }
      process.exit(1);
    }
  }
  async serveHttp(overrides = {}) {
    try {
      const resolved = resolveHttpServeConfig(this.program, overrides);
      const runtime = createServerRuntime(this.program, "http");
      const emitter = new LogEmitter({ program: this.program, resolved: resolved.log });
      this.server = {
        runtime,
        emitter,
        http: resolved,
        httpHooks: this.program.httpServer?.hooks
      };
      bootstrapAppConfig(this.program, { validateFile: "soft", runtime, emitter });
      const shutdown = () => {
        emitter.emit({ level: "info", message: "server stopping", action: "server.stop" });
        process.exit(0);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      await httpServeHttp(this, resolved);
      process.exit(0);
    } catch (err) {
      if (err instanceof Error) {
        process.stderr.write(`${err.message}
`);
      } else {
        process.stderr.write(`HTTP API server error.
`);
      }
      process.exit(1);
    }
  }
  ensureValidatedLeafInputs(ctx, leaf) {
    if (leaf.inputSchema === undefined) {
      return;
    }
    ctx.inputs;
  }
  exitLeafInputError(err, helpPath) {
    const color = process.stderr.isTTY;
    const msg = color ? `\x1B[31m${err.message}\x1B[0m` : err.message;
    process.stderr.write(`${msg}
`);
    process.stderr.write(cliHelpRender(this.presentationRoot, helpPath, true));
    process.exit(1);
  }
  prepareDispatch(argv, opts) {
    const program = this.program;
    let parseRoot;
    let completionParseRoot = opts?.presentationFallback ? this.presentationRoot : this.parseRootMerged;
    let isLeafCompletionIntercept = false;
    if (isCliLeaf(program)) {
      const intercept = builtinInterceptRoot(program, argv);
      if (intercept.isLeafCompletionIntercept || intercept.parseRoot !== program) {
        parseRoot = intercept.parseRoot;
        completionParseRoot = isCliRouter(intercept.parseRoot) ? intercept.parseRoot : opts?.presentationFallback ? this.presentationRoot : this.parseRootMerged;
        isLeafCompletionIntercept = intercept.isLeafCompletionIntercept;
      } else {
        parseRoot = program;
      }
    } else {
      parseRoot = this.parseRootMerged;
    }
    let pr = parse(parseRoot, argv);
    pr = postParseValidate(parseRoot, pr);
    if (pr.kind !== "ok" /* Ok */) {
      return { error: pr };
    }
    let current = parseRoot;
    for (const seg of pr.path) {
      if (!isCliRouter(current)) {
        const msg = "Internal error: missing handler for path.";
        return {
          error: {
            kind: "error" /* Error */,
            path: pr.path,
            args: pr.args,
            opts: pr.opts,
            pathParams: pr.pathParams,
            helpExplicit: false,
            helpPath: [],
            errorMsg: msg,
            errorHelpPath: pr.path
          }
        };
      }
      const ch = current.commands.find((candidate) => candidate.key === seg);
      if (!ch) {
        const msg = "Internal error: missing handler for path.";
        return {
          error: {
            kind: "error" /* Error */,
            path: pr.path,
            args: pr.args,
            opts: pr.opts,
            pathParams: pr.pathParams,
            helpExplicit: false,
            helpPath: [],
            errorMsg: msg,
            errorHelpPath: pr.path
          }
        };
      }
      current = ch;
    }
    if (!isCliLeaf(current) || !current.handler) {
      const msg = "Internal error: missing handler for path.";
      return {
        error: {
          kind: "error" /* Error */,
          path: pr.path,
          args: pr.args,
          opts: pr.opts,
          pathParams: pr.pathParams,
          helpExplicit: false,
          helpPath: [],
          errorMsg: msg,
          errorHelpPath: pr.path
        }
      };
    }
    return {
      pr,
      parseRoot,
      completionParseRoot,
      isLeafCompletionIntercept,
      leaf: current
    };
  }
  buildAppConfigSnapshot(opts) {
    const bootstrap = ensureAppConfig(this.program, opts);
    const snapshot = bootstrap ? createAppConfigSnapshot(this.program, bootstrap.fileData, bootstrap.resolved) : createAppConfigSnapshot(this.program, readAppConfigFileRaw(resolveAppConfigPath(this.program)), {});
    this._appConfig = snapshot;
    return snapshot;
  }
}
// ../../src/runtime/cli-errors.ts
function cliErrWithHelp(ctx, msg) {
  if (ctx.invocation === "http" || ctx.invocation === "mcp") {
    throw new Error(msg);
  }
  const color = process.stderr.isTTY;
  const line = color ? `\x1B[31m${msg}\x1B[0m` : msg;
  process.stderr.write(`${line}
`);
  process.stderr.write(cliHelpRender(cliPresentationRoot(ctx.program), ctx.commandPath, true));
  process.exit(1);
}
// README.md
var README_default = "# mcp-plugin\n\nArgsbarg MCP plugin template for Cursor and Claude Code marketplaces (@sg schemagen, JSON schemas, in-repo manifests).\n\n## Overview\n\n`mcp-plugin` packages an MCP server and agent skills directly for Cursor and Claude Code marketplaces:\n\n- **Cursor Plugin**: `.cursor-plugin/plugin.json` and `mcp.json` running `${CURSOR_PLUGIN_ROOT}/scripts/mcp.mjs` via `node`.\n- **Claude Code Plugin**: `.claude-plugin/plugin.json` and `.mcp.json` running `${CLAUDE_PLUGIN_ROOT}/scripts/mcp.mjs` via `node`.\n- **In-repo skills**: `skills/mcp-plugin/SKILL.md` discovered and loaded by agent platforms.\n- **Standalone runner**: `bun build --target=node src/index.ts --outfile scripts/mcp.mjs` creates an inlined, zero-npm-install script.\n\n## Development\n\n```bash\n# Install dependencies and generate schemas\njust setup\n\n# Build standalone MCP bundle\njust build\n\n# Test MCP server directly with node\nnode ./scripts/mcp.mjs mcp\n\n# Link into local Cursor plugins for live testing\njust install-plugin-cursor\n```\n\n## Commands\n\n- `mcp-plugin echo` — Echo text back to stdout or inspect flags.\n- `mcp-plugin render-json` — Process structured JSON payloads with schema validation.\n- `mcp-plugin status` — Show application version with schemagen output schema (`--json`).\n- `mcp-plugin workspaces` — Manage workspace resources (REST CRUD with in-memory SQLite).\n\n### Built-in commands\n\n- `mcp-plugin completion` — Install or inspect shell tab completions (bash, zsh, fish).\n- `mcp-plugin configure` — Manage agent artifacts (skills, MCP, application configuration).\n- `mcp-plugin docs` — Browse bundled documentation topics (`cli`, `mcp`, `http`, `readme`).\n- `mcp-plugin mcp` — Start the Model Context Protocol (stdio) server for AI coding agents.\n- `mcp-plugin version` — Display version information.\n\n## Documentation\n\n| Need | Resource |\n| --- | --- |\n| CLI reference | [docs/cli.md](docs/cli.md) or `mcp-plugin docs cli` |\n| MCP tools | [docs/mcp.md](docs/mcp.md) or `mcp-plugin docs mcp` |\n| HTTP API | [docs/http.md](docs/http.md) or `mcp-plugin docs http` |\n| OpenAPI 3.1 | [docs/openapi.json](docs/openapi.json) |\n";

// scripts/create-identity.ts
var createIdentity = {
  key: "mcp-plugin",
  className: "McpPlugin",
  tap: "bdombro/bun-argsbarg",
  homepage: "https://github.com/bdombro/bun-argsbarg",
  releaseRepo: "bdombro/bun-argsbarg",
  desc: "Argsbarg MCP plugin template for Cursor and Claude Code marketplaces",
  envPrefix: "MCP_PLUGIN",
  template: "plugin"
};
// src/commands/echo/command.ts
var echoCommand = {
  key: "echo",
  description: "Echo a message (MCP-friendly leaf).",
  options: [
    {
      name: "message",
      description: "Text to print.",
      kind: "string" /* String */,
      required: true
    }
  ],
  handler: (ctx) => {
    const message = ctx.stringOpt("message") ?? "";
    if (ctx.invocation === "cli") {
      console.log(message);
      return;
    }
    return message;
  }
};
// src/commands/render-json/__generated__/RenderJsonInputSchema.json
var RenderJsonInputSchema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    message: {
      type: "string",
      description: "Message to echo back."
    }
  },
  required: [
    "message"
  ],
  additionalProperties: false,
  definitions: {}
};

// src/commands/render-json/__generated__/index.ts
var RenderJsonInputSchema = RenderJsonInputSchema_default;

// src/commands/render-json/command.ts
var renderJsonCommand = {
  key: "render-json",
  description: "Echo a JSON message (schema-first JSON leaf demo).",
  kind: "json",
  inputSchema: RenderJsonInputSchema,
  handler: (ctx) => {
    const { message } = ctx.inputsAs();
    if (ctx.invocation === "cli") {
      console.log(message);
      return;
    }
    return { message };
  }
};
// src/commands/status/__generated__/StatusJsonOutputSchema.json
var StatusJsonOutputSchema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    version: {
      type: "string",
      description: "App version from program root."
    }
  },
  required: [
    "version"
  ],
  additionalProperties: false,
  definitions: {}
};

// src/commands/status/__generated__/index.ts
var StatusJsonOutputSchema = StatusJsonOutputSchema_default;

// src/commands/status/command.ts
var statusCommand = {
  key: "status",
  description: "Show app version.",
  options: [
    {
      name: "json",
      description: "Emit JSON.",
      kind: "presence" /* Presence */
    }
  ],
  outputSchema: StatusJsonOutputSchema,
  handler: (ctx) => {
    const out = { version: ctx.program.version };
    if (ctx.hasFlag("json")) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`version=${out.version}`);
    }
  }
};
// src/commands/workspaces/__generated__/WorkspaceNameInputSchema.json
var WorkspaceNameInputSchema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Workspace display name."
    }
  },
  required: [
    "name"
  ],
  additionalProperties: false,
  definitions: {}
};

// src/commands/workspaces/__generated__/index.ts
var WorkspaceNameInputSchema = WorkspaceNameInputSchema_default;

// src/commands/workspaces/command.ts
function notFound(ctx, id) {
  cliErrWithHelp(ctx, `Workspace not found: ${id}`);
}
var workspacesCommand = {
  key: "workspaces",
  description: "Workspace collection and CRUD.",
  commands: [
    {
      key: "get",
      description: "List workspaces.",
      handler: (ctx) => ({ workspaces: ctx.locals.db.workspaces.list() })
    },
    {
      key: "post",
      description: "Create a workspace.",
      inputSchema: WorkspaceNameInputSchema,
      handler: (ctx) => {
        const { name } = ctx.inputsAs();
        return ctx.locals.db.workspaces.create(name);
      }
    },
    {
      key: ":id",
      description: "One workspace by id.",
      commands: [
        {
          key: "get",
          description: "Get one workspace.",
          handler: (ctx) => {
            const id = ctx.inputsAs().id;
            const ws = ctx.locals.db.workspaces.get(id);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          }
        },
        {
          key: "put",
          description: "Replace a workspace.",
          inputSchema: WorkspaceNameInputSchema,
          handler: (ctx) => {
            const { id, name } = ctx.inputsAs();
            const ws = ctx.locals.db.workspaces.replace(id, name);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          }
        },
        {
          key: "patch",
          description: "Patch a workspace name.",
          inputSchema: WorkspaceNameInputSchema,
          handler: (ctx) => {
            const { id, name } = ctx.inputsAs();
            const ws = ctx.locals.db.workspaces.patch(id, name);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          }
        },
        {
          key: "delete",
          description: "Delete a workspace.",
          handler: (ctx) => {
            const id = ctx.inputsAs().id;
            if (!ctx.locals.db.workspaces.delete(id)) {
              notFound(ctx, id);
            }
            ctx.respond({ status: 204, body: "" });
          }
        }
      ]
    }
  ]
};

// src/db/tables/workspaces.ts
class WorkspacesTable {
  items = new Map;
  list() {
    return Array.from(this.items.values());
  }
  get(id) {
    return this.items.get(id);
  }
  create(name) {
    const id = crypto.randomUUID();
    const workspace = { id, name };
    this.items.set(id, workspace);
    return workspace;
  }
  replace(id, name) {
    if (!this.items.has(id)) {
      return;
    }
    const updated = { id, name };
    this.items.set(id, updated);
    return updated;
  }
  patch(id, name) {
    const existing = this.items.get(id);
    if (!existing) {
      return;
    }
    const updated = { ...existing, name };
    this.items.set(id, updated);
    return updated;
  }
  delete(id) {
    return this.items.delete(id);
  }
}

// src/db/index.ts
class AppDb {
  static db;
  workspaces;
  constructor() {
    this.workspaces = new WorkspacesTable;
  }
  static open() {
    return new AppDb;
  }
  static openWithRetry() {
    return AppDb.open();
  }
  static openDb() {
    AppDb.db ??= AppDb.open();
    return AppDb.db;
  }
  static resetForTests() {
    AppDb.db = AppDb.open();
  }
  close() {}
  ping() {}
  static attach(ctx) {
    if (ctx.runtime && (ctx.invocation === "http" || ctx.invocation === "mcp")) {
      ctx.runtime.state.db ??= AppDb.openWithRetry();
      ctx.locals.db = ctx.runtime.state.db;
      return;
    }
    ctx.locals.db = AppDb.openDb();
  }
  static checkReadiness(ctx) {
    const appDb = ctx.runtime?.state?.db;
    if (!appDb) {
      return false;
    }
    try {
      appDb.ping();
      return true;
    } catch {
      return false;
    }
  }
}

// src/program.ts
var program = {
  commands: [echoCommand, renderJsonCommand, statusCommand, workspacesCommand],
  description: createIdentity.desc,
  docs: {
    topics: {
      readme: {
        text: README_default
      }
    }
  },
  hooks: {
    beforeInvoke: AppDb.attach
  },
  httpServer: { enabled: true },
  key: createIdentity.key,
  mcpServer: { enabled: true },
  readiness: AppDb.checkReadiness,
  version: "1.0.0"
};

// src/index.ts
var cli = new Cli(program);
await cli.run();
