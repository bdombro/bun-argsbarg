import { resolveCapabilities } from "../capabilities.ts";
import { type CliLeaf, type CliOption, CliOptionKind, type CliProgram } from "../types.ts";

/** Uninstall command options (dynamic: `--mcp` only when MCP is enabled). */
export function uninstallBuiltinOptions(root: CliProgram): CliOption[] {
  const opts: CliOption[] = [
    {
      name: "all",
      description: "Remove all detected agent artifacts (default when no scope flags are given).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "skill",
      description: "Remove agent skills only.",
      kind: CliOptionKind.Presence,
    },
  ];

  if (resolveCapabilities(root).mcp) {
    opts.push({
      name: "mcp",
      description: "Remove MCP server configuration only.",
      kind: CliOptionKind.Presence,
    });
  }

  if (root.appConfig) {
    opts.push({
      name: "configure",
      description: "Remove the app config file only.",
      kind: CliOptionKind.Presence,
    });
  }

  opts.push(
    {
      name: "yes",
      description: "Skip the confirmation prompt.",
      kind: CliOptionKind.Presence,
      shortName: "y",
    },
    {
      name: "dry",
      description: "Show what would change without writing files.",
      kind: CliOptionKind.Presence,
    },
    {
      name: "json",
      description: "Print changed paths on stdout.",
      kind: CliOptionKind.Presence,
    },
  );

  return opts;
}

/** Builds the `uninstall` built-in command. */
export function cliBuiltinUninstallCommand(root: CliProgram): CliLeaf {
  const app = root.key;
  const notesLines = [
    "Remove agent artifacts installed by this app (skills, MCP, config).",
    "Run before `brew uninstall` while the CLI is still on PATH:",
    "",
    `  ${app} uninstall --yes`,
    `  brew uninstall <tap>/${app}`,
    "",
    "Remove app config only:",
    `  ${app} uninstall --configure --yes`,
    "",
    "Use --dry to preview changes without writing files.",
    "Use --json for machine-readable output.",
  ];
  return {
    key: "uninstall",
    description: "Remove agent skills, MCP config, and app config for this app.",
    options: uninstallBuiltinOptions(root),
    notes: notesLines.join("\n"),
    handler: () => {},
  };
}
