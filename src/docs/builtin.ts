import { CliFallbackMode, type CliLeaf, type CliProgram, type CliRouter } from "../types.ts";
import {
  DOCS_ROUTER_DESCRIPTION,
  docsEffectiveDefaultTopic,
  docsEnabled,
  docsIncludesMcpTopic,
  docsTopicDescription,
  docsUserTopicKeys,
  printDocsTopic,
} from "./resolve.ts";

function docsLeaf(program: CliProgram, key: string, description: string): CliLeaf {
  return {
    key,
    description,
    mcpTool: { enabled: false },
    handler: () => {
      printDocsTopic(program, key);
    },
  };
}

/** Built-in `docs` router with bundled topic subcommands. */
export function cliBuiltinDocsGroup(program: CliProgram): CliRouter {
  const docs = program.docs!;
  const leaves: CliLeaf[] = [];

  for (const key of docsUserTopicKeys(docs)) {
    const topic = docs.topics[key]!;
    leaves.push(docsLeaf(program, key, docsTopicDescription(key, topic.description)));
  }

  if (docsIncludesMcpTopic(program)) {
    leaves.push(
      docsLeaf(program, "mcp", "Print MCP server setup and tool guidance."),
    );
  }

  leaves.push(
    docsLeaf(program, "schema", "Print the full command tree as JSON."),
    docsLeaf(program, "api", "Print the command tree as markdown."),
    docsLeaf(program, "skill", "Print generated Cursor SKILL.md content."),
    docsLeaf(program, "all", "Print all bundled documentation combined."),
  );

  return {
    key: "docs",
    description: docs.description ?? DOCS_ROUTER_DESCRIPTION,
    fallbackCommand: docsEffectiveDefaultTopic(docs),
    fallbackMode: CliFallbackMode.MissingOnly,
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
