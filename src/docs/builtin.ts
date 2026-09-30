/*
This module builds the built-in `docs` command group router.
It registers bundled documentation topics (CLI guide, schema, MCP, HTTP) as subcommands.
*/

import {
  type AppSpec,
  type CommandGroup,
  type CommandOption,
  OptionKind,
  type RunnableCommand,
} from "../core/types.ts";
import {
  DOCS_ROUTER_DESCRIPTION,
  docsEnabled,
  docsIncludesHttpTopic,
  docsIncludesMcpTopic,
  docsIncludesOpenApiTopic,
  docsTopicDescription,
  docsUserTopicKeys,
  printDocsTopic,
  resolveDocsConfig,
} from "./resolve.ts";
import { saveDocsTopic } from "./save.ts";

const DOCS_SAVE_OPTION: CommandOption = {
  name: "save",
  description: "Write documentation to ./docs/.",
  kind: OptionKind.Presence,
};

function runDocsTopic(program: AppSpec, topic: string, ctx: { hasFlag(name: string): boolean }): void {
  if (ctx.hasFlag("save")) {
    process.stdout.write(`${saveDocsTopic(program, topic)}\n`);
    return;
  }
  printDocsTopic(program, topic);
}

function docsLeaf(program: AppSpec, key: string, description: string): RunnableCommand {
  return {
    key,
    description,
    options: [DOCS_SAVE_OPTION],
    mcpTool: { enabled: false },
    handler: (ctx) => {
      runDocsTopic(program, key, ctx);
    },
  };
}

/** Help notes for the `docs` router. */
function docsRouterNotes(): string {
  return "Topics print to stdout. Add --save to write files under ./docs/.";
}

/** Built-in `docs` router with bundled topic subcommands. */
export function cliBuiltinDocsGroup(program: AppSpec): CommandGroup {
  const docs = resolveDocsConfig(program);
  const topics = docs.topics ?? {};
  const leaves: RunnableCommand[] = [];

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

  leaves.push(
    docsLeaf(program, "cli-schema", "Print the full CLI command tree as JSON."),
    docsLeaf(program, "cli", "Print the full command reference as markdown."),
  );

  return {
    key: "docs",
    description: docs.description ?? DOCS_ROUTER_DESCRIPTION,
    notes: docsRouterNotes(),
    options: [DOCS_SAVE_OPTION],
    commands: leaves,
  };
}

/** Returns the docs built-in when enabled. */
export function cliBuiltinDocsGroupIfEnabled(program: AppSpec): CommandGroup | null {
  if (!docsEnabled(program)) {
    return null;
  }
  return cliBuiltinDocsGroup(program);
}
