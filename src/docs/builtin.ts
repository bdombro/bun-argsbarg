import { CliFallbackMode, CliOptionKind, type CliLeaf, type CliOption, type CliProgram, type CliRouter } from "../types.ts";
import {
  DOCS_ROUTER_DESCRIPTION,
  docsEffectiveDefaultTopic,
  docsEnabled,
  docsIncludesMcpTopic,
  docsTopicDescription,
  docsUserTopicKeys,
  printDocsTopic,
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
    docsLeaf(program, "api", "Print the full command reference as markdown."),
    docsLeaf(program, "skill", "Print a reference agent SKILL, use `install --skill` for optimized."),
  );

  return {
    key: "docs",
    description: docs.description ?? DOCS_ROUTER_DESCRIPTION,
    notes: docsRouterNotes(),
    options: [DOCS_SAVE_OPTION],
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
