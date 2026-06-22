import { cliSchemaJson } from "../schema.ts";
import { generateSkillBundle } from "../skill/generate.ts";
import type { CliDocsConfig, CliProgram } from "../types.ts";
import { generateApiGuide } from "./api-guide.ts";
import { generateMcpGuide } from "./mcp-guide.ts";

/** Built-in docs subcommand keys not allowed in `docs.topics`. */
export const DOCS_BUILTIN_TOPIC_KEYS = ["mcp", "all", "schema", "api", "skill"] as const;

export type DocsBuiltinTopicKey = (typeof DOCS_BUILTIN_TOPIC_KEYS)[number];

/** Default router description for the `docs` built-in. */
export const DOCS_ROUTER_DESCRIPTION = "Print bundled CLI documentation.";

/** Returns whether bundled docs are enabled on the program root. */
export function docsEnabled(program: CliProgram): boolean {
  return program.docs?.enabled === true;
}

/** User topic keys in declaration order. */
export function docsUserTopicKeys(docs: CliDocsConfig): string[] {
  return Object.keys(docs.topics);
}

/** Subcommand used when argv is bare `myapp docs`. */
export function docsEffectiveDefaultTopic(docs: CliDocsConfig): string {
  if (docs.defaultTopic !== undefined) {
    return docs.defaultTopic;
  }
  const keys = docsUserTopicKeys(docs);
  if (keys.length === 0) {
    throw new Error("docs.topics must be non-empty");
  }
  const first = keys[0];
  if (first === undefined) {
    throw new Error("docs.topics must be non-empty");
  }
  return first;
}

/** Whether MCP auto-guide topic is included. */
export function docsIncludesMcpTopic(program: CliProgram): boolean {
  return docsEnabled(program) && program.mcpServer?.enabled === true;
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
  const docs = program.docs;
  if (!docs) {
    throw new Error("docs not enabled");
  }
  if (topic === "mcp") {
    if (!docsIncludesMcpTopic(program)) {
      throw new Error("Unknown docs topic 'mcp'.");
    }
    return generateMcpGuide(program);
  }
  const entry = docs.topics[topic];
  if (!entry) {
    throw new Error(`Unknown docs topic '${topic}'.`);
  }
  return entry.text;
}

/** Full file body for a docs topic (stdout or `--save`). */
export function docsTopicContent(program: CliProgram, topic: string): string {
  if (topic === "schema") {
    return cliSchemaJson(program);
  }
  if (topic === "api") {
    return generateApiGuide(program);
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
