/*
HTTP REST route collection and request matching from the CLI command tree.
*/

import {
  type CliHttpMethod,
  type CliLeaf,
  type CliNode,
  type CliProgram,
  isCliLeaf,
  isJsonLeaf,
  CliOptionKind as OptKind,
} from "../core/types.ts";
import { formatMcpOptionValue, leafHasYesOption, leafWireOptions } from "../mcp/tools.ts";
import { isHttpDisabled, isHttpHidden } from "../runtime/exposure.ts";
import { buildHttpUserPath, httpUserPathRegexPrefix, resolveHttpPathPrefix } from "./paths.ts";

const VERB_KEYS = new Set(["get", "post", "put", "patch", "delete"]);

/** One HTTP route derived from a user leaf command. */
export interface HttpRouteDef {
  method: CliHttpMethod;
  /** OpenAPI-style path e.g. `/workspaces/{id}` or `/api/workspaces/{id}`. */
  openApiPath: string;
  /** Regex matching pathname (no query). */
  pathPattern: RegExp;
  /** Argv command path; `:id` tokens replaced at request time. */
  commandPath: string[];
  /** Param names in URL order (without `:`). */
  paramNames: string[];
  leaf: CliLeaf;
}

function isParamRouterKey(key: string): boolean {
  return key.startsWith(":");
}

function inferHttpMethod(leaf: CliLeaf): CliHttpMethod {
  if (leaf.http?.method) {
    return leaf.http.method;
  }
  const lower = leaf.key.toLowerCase();
  if (VERB_KEYS.has(lower)) {
    return lower.toUpperCase() as CliHttpMethod;
  }
  return "POST";
}

function isVerbLeaf(leaf: CliLeaf): boolean {
  return VERB_KEYS.has(leaf.key.toLowerCase()) && leaf.http?.method === undefined;
}

function segmentForNode(node: CliNode): string {
  return node.http?.segment ?? node.key;
}

function leafHttpExposed(leaf: CliLeaf): boolean {
  if (isHttpDisabled(leaf) || isHttpHidden(leaf)) {
    return false;
  }
  return true;
}

type WalkState = {
  urlSegments: string[];
  commandPath: string[];
  paramNames: string[];
};

function pushRoute(routes: HttpRouteDef[], leaf: CliLeaf, state: WalkState, pathPrefix: string): void {
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
  const patternParts = urlSegments.map((s) => (s.startsWith(":") ? "([^/]+)" : escapeRegex(s)));
  const regexPrefix = httpUserPathRegexPrefix(pathPrefix);
  const tail = patternParts.length > 0 ? `/${patternParts.join("/")}` : "";
  const pathPattern = new RegExp(`^${regexPrefix}${tail}/?$`);
  routes.push({
    method: inferHttpMethod(leaf),
    openApiPath,
    pathPattern,
    commandPath,
    paramNames: [...state.paramNames],
    leaf,
  });
}

function walk(node: CliNode, state: WalkState, routes: HttpRouteDef[], pathPrefix: string): void {
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
      walk(
        child,
        {
          urlSegments: [...state.urlSegments, child.key],
          commandPath: [...state.commandPath, child.key],
          paramNames: [...state.paramNames, paramName],
        },
        routes,
        pathPrefix,
      );
      continue;
    }
    if (isCliLeaf(child)) {
      walk(
        child,
        {
          urlSegments: state.urlSegments,
          commandPath: [...state.commandPath, child.key],
          paramNames: state.paramNames,
        },
        routes,
        pathPrefix,
      );
      continue;
    }
    const seg = segmentForNode(child);
    walk(
      child,
      {
        urlSegments: [...state.urlSegments, seg],
        commandPath: [...state.commandPath, child.key],
        paramNames: state.paramNames,
      },
      routes,
      pathPrefix,
    );
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collects all HTTP routes for exposed user leaves. */
export function collectHttpRoutes(program: CliProgram): HttpRouteDef[] {
  const routes: HttpRouteDef[] = [];
  if (!program.httpServer?.enabled) {
    return routes;
  }

  const pathPrefix = resolveHttpPathPrefix(program);

  if (isCliLeaf(program)) {
    walk(program, { urlSegments: [], commandPath: [], paramNames: [] }, routes, pathPrefix);
    return routes;
  }

  for (const child of program.commands) {
    if (
      child.key === "completion" ||
      child.key === "configure" ||
      child.key === "docs" ||
      child.key === "mcp" ||
      child.key === "version" ||
      child.key === "http"
    ) {
      continue;
    }
    if (isCliLeaf(child)) {
      walk(child, { urlSegments: [], commandPath: [child.key], paramNames: [] }, routes, pathPrefix);
    } else {
      walk(
        child,
        { urlSegments: [segmentForNode(child)], commandPath: [child.key], paramNames: [] },
        routes,
        pathPrefix,
      );
    }
  }

  return routes;
}

/** Match result for an incoming HTTP request. */
export type HttpRouteMatch = { ok: true; route: HttpRouteDef; pathParams: Record<string, string> } | { ok: false };

/** Finds the best matching route for method + pathname. */
export function matchHttpRoute(program: CliProgram, method: string, pathname: string): HttpRouteMatch {
  const routes = collectHttpRoutes(program);
  const upper = method.toUpperCase();
  let best: { route: HttpRouteDef; pathParams: Record<string, string>; score: number } | undefined;

  for (const route of routes) {
    if (route.method !== upper) {
      continue;
    }
    const m = route.pathPattern.exec(pathname);
    if (!m) {
      continue;
    }
    const pathParams: Record<string, string> = {};
    for (let i = 0; i < route.paramNames.length; i++) {
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

/** Builds argv from an HTTP route match, query string, and optional JSON body. */
export function httpRequestToArgv(
  _program: CliProgram,
  route: HttpRouteDef,
  pathParams: Record<string, string>,
  query: Record<string, string>,
  body: Record<string, unknown>,
): string[] | { error: string } {
  const argv: string[] = [];
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
  if (isJsonLeaf(leaf)) {
    return argv;
  }

  const merged: Record<string, unknown> = { ...body, ...query };
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
    if (opt.kind === OptKind.Json) {
      continue;
    }
    const val = merged[opt.name];
    if (val === undefined) {
      continue;
    }
    if (opt.kind === OptKind.Presence) {
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

/** Default success HTTP status for a route method when handler omits status. */
export function defaultSuccessStatus(method: CliHttpMethod, hasBody: boolean): number {
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
