import { docsSkillTopicDescription } from "../builtins/configure-copy.ts";
import { type CliLeaf, type CliOption, CliOptionKind, type CliProgram, type CliRouter } from "../core/types.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";
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

const DOCS_SAVE_OPTION: CliOption = {
  name: "save",
  description: "Write documentation to ./docs/.",
  kind: CliOptionKind.Presence,
};

function runDocsTopic(program: CliProgram, topic: string, ctx: { hasFlag(name: string): boolean }): void {
  if (ctx.hasFlag("save")) {
    process.stdout.write(`${saveDocsTopic(program, topic)}\n`);
    return;
  }
  printDocsTopic(program, topic);
}

function docsLeaf(program: CliProgram, key: string, description: string): CliLeaf {
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
export function cliBuiltinDocsGroup(program: CliProgram): CliRouter {
  const docs = resolveDocsConfig(program);
  const topics = docs.topics ?? {};
  const leaves: CliLeaf[] = [];

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
    docsLeaf(program, "skill", docsSkillTopicDescription(program, resolveCapabilities(program))),
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
export function cliBuiltinDocsGroupIfEnabled(program: CliProgram): CliRouter | null {
  if (!docsEnabled(program)) {
    return null;
  }
  return cliBuiltinDocsGroup(program);
}
