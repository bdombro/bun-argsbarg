/*
Hosts several argsbarg MCP apps in one Node process behind one stdio server (`argsbarg gateway`),
saving one Node runtime per app per agent session. Each plugin bundle is imported as-is: its
`app.run()` finds the gateway registry on globalThis and registers a request handler instead of
serving stdio. The gateway names tools `<alias>_<tool>`, merges instructions and resources, routes
calls to the owning app, and serves one shared `mcp_resource_read` tool.

The registry contract (a global symbol and the {@link McpGatewayApp} shape) is the only thing
shared between argsbarg copies, because every bundle carries its own copy of argsbarg.
*/

import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bootstrapMcpEnv } from "./env.ts";
import { MCP_PROTOCOL_VERSIONS, type McpRequestControls, type McpRequestHandler, mcpServeStdio } from "./server.ts";
import { MCP_RESOURCE_READ_HINT, MCP_RESOURCE_READ_TOOL } from "./tools.ts";

/** Global symbol under which the gateway exposes its registry while it imports a bundle. */
export const MCP_GATEWAY_REGISTRY = Symbol.for("argsbarg.mcp.gateway");

/** One app as registered with the gateway; must stay compatible across argsbarg versions. */
export interface McpGatewayApp {
  /** App key (the default alias). */
  key: string;
  /** App version. */
  version: string;
  /** The app's MCP instructions, without the resource-read hint. */
  instructions?: string;
  /** Handles one JSON-RPC request with the app's own MCP server logic. */
  handle(
    /** Request with an id. */
    req: { jsonrpc: "2.0"; id: string | number; method: string; params?: Record<string, unknown> },
    /** Response writer. */
    writeResponse: (message: Record<string, unknown>) => void,
    /** Cancellation and progress. */
    controls: McpRequestControls,
  ): Promise<void>;
}

/** Registry the gateway puts on globalThis while one bundle is imported. */
export interface McpGatewayRegistry {
  /** Called by the bundle's `app.run()` instead of serving stdio. */
  register(app: McpGatewayApp): void;
}

/** One bundle to mount: an optional alias and the bundle path. */
export interface McpGatewayEntry {
  /** Tool-name prefix; defaults to the app key. */
  alias?: string;
  /** Path to the plugin bundle (absolute, or relative to the current directory). */
  path: string;
}

/** A registered app under its alias. */
interface MountedApp {
  /** Tool-name prefix. */
  alias: string;
  /** Registered app. */
  app: McpGatewayApp;
}

/** Aliases become tool-name prefixes, so keep them to letters, digits and dashes. */
const ALIAS_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;

/** Returns the registry when this process is importing bundles for a gateway, else undefined. */
export function mcpGatewayRegistry(): McpGatewayRegistry | undefined {
  return (globalThis as Record<symbol, unknown>)[MCP_GATEWAY_REGISTRY] as McpGatewayRegistry | undefined;
}

/** Parses `[alias=]path` command-line entries. */
export function parseGatewayEntries(
  /** Raw entries. */
  raw: string[],
): McpGatewayEntry[] {
  return raw.map((item) => {
    const eq = item.indexOf("=");
    if (eq > 0 && ALIAS_PATTERN.test(item.slice(0, eq))) return { alias: item.slice(0, eq), path: item.slice(eq + 1) };
    return { path: item };
  });
}

/** Imports each bundle and collects the app it registers, in order. */
export async function loadGatewayApps(
  /** Bundles to mount. */
  entries: McpGatewayEntry[],
): Promise<MountedApp[]> {
  const mounted: MountedApp[] = [];
  const globals = globalThis as Record<symbol, unknown>;
  for (const entry of entries) {
    let registered: McpGatewayApp | undefined;
    const registry: McpGatewayRegistry = {
      register(app) {
        registered = app;
      },
    };
    globals[MCP_GATEWAY_REGISTRY] = registry;
    try {
      const file = isAbsolute(entry.path) ? entry.path : resolve(entry.path);
      await import(pathToFileURL(file).href);
    } finally {
      delete globals[MCP_GATEWAY_REGISTRY];
    }
    const app = registered as McpGatewayApp | undefined;
    if (!app) {
      throw new Error(`${entry.path} did not register an MCP app (it needs a newer argsbarg and mcpServer enabled)`);
    }
    const alias = entry.alias ?? app.key;
    if (!ALIAS_PATTERN.test(alias)) throw new Error(`Invalid alias "${alias}" (letters, digits and dashes)`);
    if (mounted.some((m) => m.alias === alias)) throw new Error(`Duplicate alias "${alias}"`);
    mounted.push({ alias, app });
  }
  return mounted;
}

/** Builds the request router for mounted apps. */
export function createGatewayHandler(
  /** Mounted apps, in tool-list order. */
  mounted: MountedApp[],
  /** Server name and version reported to clients. */
  info: { name: string; version: string },
): McpRequestHandler {
  /** Resource URI → owning app, filled on first need. */
  let owners: Map<string, MountedApp> | undefined;
  /** Every app's resources, filled with `owners`. */
  let resources: Record<string, unknown>[] = [];

  /** Sends one request to an app and returns its result; throws on a JSON-RPC error. */
  async function ask(
    /** Target app. */
    m: MountedApp,
    /** JSON-RPC method. */
    method: string,
    /** Request params. */
    params: Record<string, unknown> | undefined,
    /** Controls of the client request being served. */
    controls: McpRequestControls,
  ): Promise<Record<string, unknown>> {
    let reply: Record<string, unknown> | undefined;
    await m.app.handle(
      { jsonrpc: "2.0", id: "gateway", method, ...(params ? { params } : {}) },
      (message) => {
        reply = message;
      },
      controls,
    );
    if (!reply) throw new Error(`${m.alias}: no response to ${method}`);
    if ("error" in reply) {
      throw new Error(`${m.alias}: ${(reply.error as { message?: string } | undefined)?.message ?? "error"}`);
    }
    return (reply.result ?? {}) as Record<string, unknown>;
  }

  /** Lists every app's resources once and remembers their owners. */
  async function loadResources(controls: McpRequestControls): Promise<Map<string, MountedApp>> {
    if (owners) return owners;
    const map = new Map<string, MountedApp>();
    const all: Record<string, unknown>[] = [];
    for (const m of mounted) {
      const listed = ((await ask(m, "resources/list", undefined, controls)).resources ?? []) as Record<
        string,
        unknown
      >[];
      for (const r of listed) {
        if (typeof r.uri === "string" && !map.has(r.uri)) {
          map.set(r.uri, m);
          all.push(r);
        }
      }
    }
    resources = all;
    owners = map;
    return map;
  }

  /** The app whose alias prefixes `name`, longest alias first. */
  function routeTool(name: string): { m: MountedApp; tool: string } | undefined {
    let best: MountedApp | undefined;
    for (const m of mounted) {
      if (name.startsWith(`${m.alias}_`) && (!best || m.alias.length > best.alias.length)) best = m;
    }
    return best ? { m: best, tool: name.slice(best.alias.length + 1) } : undefined;
  }

  return async (req, writeResponse, controls) => {
    const id = req.id as string | number;
    const params = req.params ?? {};
    /** Writes a JSON-RPC error for this request. */
    const fail = (code: number, message: string) => writeResponse({ error: { code, message }, id, jsonrpc: "2.0" });
    /** Writes a JSON-RPC result for this request. */
    const ok = (result: Record<string, unknown>) => writeResponse({ id, jsonrpc: "2.0", result });

    try {
      switch (req.method) {
        case "initialize": {
          let protocolVersion: unknown = MCP_PROTOCOL_VERSIONS[0];
          for (const m of mounted) protocolVersion = (await ask(m, "initialize", params, controls)).protocolVersion;
          const map = await loadResources(controls);
          const sections = mounted
            .filter((m) => m.app.instructions)
            .map((m) => `## ${m.alias}\n\n${m.app.instructions}`);
          const instructions = [
            `This server hosts several plugins. Tool names start with the plugin name: \`<plugin>_<tool>\` (plugins: ${mounted.map((m) => m.alias).join(", ")}).`,
            ...sections,
            ...(map.size > 0 ? [MCP_RESOURCE_READ_HINT] : []),
          ].join("\n\n");
          ok({
            capabilities: { resources: {}, tools: {} },
            instructions,
            protocolVersion,
            serverInfo: { name: info.name, version: info.version },
          });
          return;
        }
        case "ping":
          ok({});
          return;
        case "tools/list": {
          const tools: Record<string, unknown>[] = [];
          let readAnnotations: unknown;
          for (const m of mounted) {
            for (const tool of ((await ask(m, "tools/list", params, controls)).tools ?? []) as Record<
              string,
              unknown
            >[]) {
              if (tool.name === MCP_RESOURCE_READ_TOOL) {
                readAnnotations ??= tool.annotations;
                continue;
              }
              tools.push({ ...tool, name: `${m.alias}_${tool.name}` });
            }
          }
          await loadResources(controls);
          if (resources.length > 0) {
            const lines = resources.map((r) => `- ${r.uri} — ${r.description ?? r.name}`);
            tools.push({
              name: MCP_RESOURCE_READ_TOOL,
              description: `Read an MCP resource by URI. Same body as resources/read, for hosts that can't read resources.\n\nResources:\n${lines.join("\n")}`,
              inputSchema: {
                type: "object",
                properties: {
                  uri: { type: "string", enum: resources.map((r) => r.uri), description: "Resource URI." },
                },
                required: ["uri"],
                additionalProperties: false,
              },
              ...(readAnnotations ? { annotations: readAnnotations } : {}),
            });
          }
          ok({ tools });
          return;
        }
        case "tools/call": {
          const name = params.name;
          if (typeof name !== "string") {
            fail(-32602, "Invalid params: name required");
            return;
          }
          if (name === MCP_RESOURCE_READ_TOOL) {
            const uri = (params.arguments as Record<string, unknown> | undefined)?.uri;
            const owner = typeof uri === "string" ? (await loadResources(controls)).get(uri) : undefined;
            if (!owner || typeof uri !== "string") {
              ok({ content: [{ type: "text", text: `Unknown resource: ${String(uri)}` }], isError: true });
              return;
            }
            const read = await ask(owner, "resources/read", { uri }, controls);
            const contents = (read.contents ?? []) as { text?: string }[];
            ok({ content: contents.map((c) => ({ type: "text", text: c.text ?? "" })), isError: false });
            return;
          }
          const route = routeTool(name);
          if (!route) {
            fail(-32602, `Unknown tool: ${name}`);
            return;
          }
          await route.m.app.handle({ ...req, id, params: { ...params, name: route.tool } }, writeResponse, controls);
          return;
        }
        case "resources/list":
          await loadResources(controls);
          ok({ resources });
          return;
        case "resources/read": {
          const uri = params.uri;
          const owner = typeof uri === "string" ? (await loadResources(controls)).get(uri) : undefined;
          if (!owner) {
            fail(-32602, `Unknown resource: ${String(uri)}`);
            return;
          }
          await owner.app.handle({ ...req, id }, writeResponse, controls);
          return;
        }
        default:
          fail(-32601, "Method not found");
      }
    } catch (err) {
      fail(-32603, err instanceof Error ? err.message : "Internal error");
    }
  };
}

/** Imports the bundles and serves them over stdio until stdin closes. */
export async function mcpGatewayServe(
  /** Bundles to mount. */
  entries: McpGatewayEntry[],
  /** Server name and version reported to clients. */
  info: { name: string; version: string },
): Promise<void> {
  bootstrapMcpEnv({});
  const mounted = await loadGatewayApps(entries);
  const handler = createGatewayHandler(mounted, info);
  process.stderr.write(`[argsbarg] gateway ready: ${mounted.map((m) => `${m.alias} ${m.app.version}`).join(", ")}\n`);
  await mcpServeStdio(handler, (message) => process.stderr.write(`[argsbarg] ${message}\n`));
}
