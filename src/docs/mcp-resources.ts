/*
Auto MCP resources for user docs.topics when docs and MCP are both enabled.
*/

import type { CliProgram } from "~/core/types.ts";
import { docsEnabled, docsTopicDescription, docsTopicText, docsUserTopicKeys, resolveDocsConfig } from "./resolve.ts";

/** Default URI pattern for a docs topic MCP resource (`<mcpId>://docs/<topicKey>`). */
export function defaultDocsTopicResourceUri(mcpId: string, topicKey: string): string {
  return `${mcpId}://docs/${topicKey}`;
}

/** Sanitized MCP server id from program key (matches mcpServerId in mcp/tools.ts). */
function mcpIdFromProgram(program: CliProgram): string {
  return program.key.replace(/[^a-zA-Z0-9]/g, "_");
}

/** Resolved URI for one user docs topic resource. */
export function resolveDocsTopicResourceUri(program: CliProgram, topicKey: string): string {
  return defaultDocsTopicResourceUri(mcpIdFromProgram(program), topicKey);
}

/** All auto-generated docs topic resources (empty when docs or MCP disabled). */
export function docsMcpResources(program: CliProgram): {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
  load: () => string;
}[] {
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
        return text.endsWith("\n") ? text : `${text}\n`;
      },
    };
  });
}

/** Reserved MCP resource URIs from auto docs topics (for validation). */
export function reservedDocsTopicResourceUris(program: CliProgram): string[] {
  if (!docsEnabled(program) || program.mcpServer?.enabled !== true) {
    return [];
  }
  const docs = resolveDocsConfig(program);
  return docsUserTopicKeys(docs).map((key) => resolveDocsTopicResourceUri(program, key));
}
