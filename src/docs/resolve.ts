import type { CliDocsConfig, CliProgram } from "../types.ts";
import { cliSchemaJson } from "../schema.ts";
import { generateSkillBundle } from "../skill/generate.ts";
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
  return keys[0]!;
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

/** Ordered keys for `docs all` (user topics, then auto `mcp` when enabled). */
export function docsPrintOrder(program: CliProgram): string[] {
  const docs = program.docs!;
  const order = docsUserTopicKeys(docs);
  if (docsIncludesMcpTopic(program)) {
    order.push("mcp");
  }
  return order;
}

/** Markdown body for one docs topic key. */
export function docsTopicText(program: CliProgram, topic: string): string {
  const docs = program.docs!;
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

/** All bundled docs concatenated with horizontal rules. */
export function combineAllDocs(program: CliProgram): string {
  return docsPrintOrder(program)
    .map((key) => docsTopicText(program, key).trim())
    .join("\n\n---\n\n");
}

/** Writes CLI schema JSON to stdout (`docs schema`). */
export function printDocsSchema(program: CliProgram): void {
  process.stdout.write(cliSchemaJson(program));
}

/** Writes markdown API reference to stdout (`docs api`). */
export function printDocsApi(program: CliProgram): void {
  process.stdout.write(generateApiGuide(program));
}

/** Writes generated Cursor SKILL.md to stdout (`docs skill`). */
export function printDocsSkill(program: CliProgram): void {
  const bundle = generateSkillBundle(program, "cursor");
  process.stdout.write(`${bundle.skillMd}\n`);
}

/** Writes one docs topic (or `all`) to stdout. */
export function printDocsTopic(program: CliProgram, topic: string): void {
  if (topic === "schema") {
    printDocsSchema(program);
    return;
  }
  if (topic === "api") {
    printDocsApi(program);
    return;
  }
  if (topic === "skill") {
    printDocsSkill(program);
    return;
  }
  const content = topic === "all" ? combineAllDocs(program) : docsTopicText(program, topic);
  process.stdout.write(`${content}\n`);
}
