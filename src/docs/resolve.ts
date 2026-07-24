import { cliSchemaJson } from "../core/schema.ts";
import type { CliDocsConfig, CliProgram } from "../core/types.ts";
import { openApiJson } from "../http/openapi.ts";
import { generateSkillBundle } from "../skill/generate.ts";
import { generateCliGuide } from "./cli-guide.ts";
import { generateHttpGuide } from "./http-guide.ts";
import { generateMcpGuide } from "./mcp-guide.ts";

/** Built-in docs subcommand keys not allowed in `docs.topics`. */
export const DOCS_BUILTIN_TOPIC_KEYS = ["http", "mcp", "all", "cli-schema", "cli", "skill", "openapi"] as const;

export type DocsBuiltinTopicKey = (typeof DOCS_BUILTIN_TOPIC_KEYS)[number];

/** Default router description for the `docs` built-in. */
export const DOCS_ROUTER_DESCRIPTION = "Print bundled CLI documentation.";

/** Returns whether bundled docs are enabled on the program root. */
export function docsEnabled(program: CliProgram): boolean {
  return program.docs?.enabled !== false;
}

/** Normalized docs config with defaults applied. */
export function resolveDocsConfig(program: CliProgram): CliDocsConfig {
  return {
    description: program.docs?.description,
    topics: program.docs?.topics ?? {},
  };
}

/** User topic keys in declaration order. */
export function docsUserTopicKeys(docs: CliDocsConfig): string[] {
  return Object.keys(docs.topics ?? {});
}

/** Whether MCP auto-guide topic is included. */
export function docsIncludesMcpTopic(program: CliProgram): boolean {
  return docsEnabled(program) && program.mcpServer?.enabled === true;
}

/** Whether HTTP auto-guide topic is included. */
export function docsIncludesHttpTopic(program: CliProgram): boolean {
  return docsEnabled(program) && program.httpServer?.enabled === true;
}

/** Whether OpenAPI export topic is included. */
export function docsIncludesOpenApiTopic(program: CliProgram): boolean {
  return docsIncludesHttpTopic(program);
}

/** Leaf help description for a user topic. */
export function docsTopicDescription(key: string, custom?: string): string {
  if (custom) {
    return custom;
  }
  if (key === "readme") {
    return "Print README (user guide).";
  }
  const label = key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `Print ${label} documentation.`;
}

/** Markdown body for one docs topic key. */
export function docsTopicText(program: CliProgram, topic: string): string {
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

/** Full file body for a docs topic (stdout or `--save`). */
export function docsTopicContent(program: CliProgram, topic: string): string {
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
  if (topic === "skill") {
    return `${generateSkillBundle(program, "cursor").skillMd}\n`;
  }
  const text = docsTopicText(program, topic);
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** Writes one docs topic to stdout. */
export function printDocsTopic(program: CliProgram, topic: string): void {
  process.stdout.write(docsTopicContent(program, topic));
}
