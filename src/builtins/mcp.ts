import {
  type AppSpec,
  type CommandGroup,
  type CommandOption,
  FallbackMode,
  OptionKind,
  type RunnableCommand,
} from "../core/types.ts";
import { docsEnabled } from "../docs/resolve.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";

const MCP_SERVE_OPTIONS: readonly CommandOption[] = [
  { name: "obscure-errors", description: "Hide unexpected errors from clients.", kind: OptionKind.Presence },
  {
    name: "log-format",
    description: "Log format: json (ECS Logging) or text.",
    kind: OptionKind.Enum,
    choices: ["json", "text"],
  },
  {
    name: "log-file",
    description: "Append logs to this file (relative → app config dir).",
    kind: OptionKind.String,
  },
  { name: "dev", description: "Print full stacks to stderr on errors.", kind: OptionKind.Presence },
];

/** Built-in `mcp` router: bare `myapp mcp` runs stdio (via hidden `serve` fallback); `mcp bundle` packs `.mcpb`. */
export function cliBuiltinMcpCommand(program: AppSpec): CommandGroup {
  const caps = resolveCapabilities(program);
  const lines = [
    "Stdio MCP server. Add to Cursor, Claude Code, or Claude Desktop:",
    "",
    "  command: {argsbarg:program}",
    "  args: mcp",
    "",
  ];
  if (caps.configure) {
    lines.push("Or:", "", "  {argsbarg:program} configure", "");
  }
  if (docsEnabled(program)) {
    lines.push("Full setup guide: {argsbarg:program} docs mcp");
  }

  const serve: RunnableCommand = {
    key: "serve",
    cli: { hidden: true },
    description: "Run as an MCP server over stdio for AI agents.",
    handler: () => {},
  };

  const bundle: RunnableCommand = {
    key: "bundle",
    description: "Pack dist MCP artifacts (`.mcpb`, Claude Code plugin zip, Cursor plugin zip) from dist/<key>.",
    handler: () => {},
  };

  return {
    key: "mcp",
    description: "MCP server and bundle tools.",
    notes: lines.join("\n"),
    options: [...MCP_SERVE_OPTIONS],
    fallbackCommand: "serve",
    fallbackMode: FallbackMode.MissingOnly,
    commands: [serve, bundle],
  };
}
