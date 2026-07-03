import { resolveCapabilities } from "../capabilities.ts";
import { type CliLeaf, type CliOption, CliOptionKind, type CliProgram } from "../types.ts";

/** Install command options (dynamic: `--mcp` only when MCP is enabled). */
export function installBuiltinOptions(root: CliProgram): CliOption[] {
  const opts: CliOption[] = [
    {
      name: "all",
      description: "Install agent skills and MCP config (default artifact set for this app).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "skill",
      description:
        "Install agent skills for Cursor, Claude, and other supported AI tools on this machine.",
      kind: CliOptionKind.Presence,
    },
  ];

  if (resolveCapabilities(root).mcp) {
    opts.push({
      name: "mcp",
      description:
        "Add MCP server configuration for Cursor, Claude Code, and other supported agents.",
      kind: CliOptionKind.Presence,
    });
  }

  if (root.appConfig) {
    opts.push({
      name: "configure",
      description: "Run the interactive configuration wizard.",
      kind: CliOptionKind.Presence,
    });
  }

  opts.push(
    {
      name: "status",
      description: "Print what is currently installed (read-only).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "reinstall",
      description:
        "Refresh installed agent artifacts (skills, MCP). Used by Homebrew post_install.",
      kind: CliOptionKind.Presence,
    },
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
      description: "Print changed paths (install/reinstall) or status JSON on stdout.",
      kind: CliOptionKind.Presence,
    },
  );

  return opts;
}

/** Builds the `install` built-in command. */
export function cliBuiltinInstallCommand(root: CliProgram): CliLeaf {
  const app = root.key;
  const notesLines = [
    "Install the binary via Homebrew (tap-from-repo), then refresh agent artifacts:",
    `  brew tap <org>/<repo>`,
    `  brew install <tap>/${app}`,
    "",
    "Homebrew post_install runs:",
    `  ${app} install --reinstall --yes`,
    "",
    "Configure separately (interactive):",
    `  ${app} install --configure`,
    "",
    "Upgrade:",
    `  brew upgrade ${app}`,
    "",
    "Shell completions are installed by Homebrew during brew install.",
    "See: https://docs.brew.sh/Shell-Completion",
    "",
    "See what is installed:",
    `  ${app} install --status`,
    "",
    "Remove agent artifacts:",
    `  ${app} uninstall --yes`,
    "",
    "Use --dry to preview changes without writing files.",
    "Use --json for machine-readable output.",
  ];
  return {
    key: "install",
    description: "Install agent skills and MCP config for this app (binary via Homebrew).",
    options: installBuiltinOptions(root),
    notes: notesLines.join("\n"),
    handler: () => {},
  };
}
