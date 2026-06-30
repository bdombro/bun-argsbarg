import { resolveCapabilities } from "../capabilities.ts";
import { type CliLeaf, type CliOption, CliOptionKind, type CliProgram } from "../types.ts";

/** Install command options (dynamic: `--mcp` only when MCP is enabled). */
export function installBuiltinOptions(root: CliProgram): CliOption[] {
  const opts: CliOption[] = [
    {
      name: "all",
      description:
        "Install the default set (app, shell completions, and configuration when supported).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "app",
      description: "Copy this app to your install directory (default ~/.local/bin).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "completions",
      description:
        "Install bash, zsh, and fish tab-completion scripts (each skipped silently if that shell is not on PATH).",
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
      description:
        "Run the configuration wizard (install), or remove the config file (--uninstall).",
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
      description: "Refresh everything already installed for this app.",
      kind: CliOptionKind.Presence,
    },
  );

  if (resolveCapabilities(root).update) {
    opts.push({
      name: "update",
      description: "Download the latest release and refresh installed files.",
      kind: CliOptionKind.Presence,
    });
  }

  opts.push(
    {
      name: "uninstall",
      description:
        "Remove installed files (--all removes everything; use individual flags to remove one category).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "from",
      description: "App executable to copy (default: running executable). Used with --reinstall.",
      kind: CliOptionKind.String,
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
      description: "Print changed paths (install/update/uninstall) or status JSON on stdout.",
      kind: CliOptionKind.Presence,
    },
  );

  return opts;
}

/** Builds the `install` built-in command. */
export function cliBuiltinInstallCommand(root: CliProgram): CliLeaf {
  const app = root.key;
  const notesLines = [
    "First-time setup:",
    `  ${app} install --yes`,
    "",
    "Refresh after upgrading:",
    `  ${app} install --reinstall`,
  ];
  if (resolveCapabilities(root).update) {
    notesLines.push("", "Upgrade to latest release:", `  ${app} install --update`);
  }
  notesLines.push(
    "",
    "See what is installed:",
    `  ${app} install --status`,
    "",
    "Remove everything installed with --all:",
    `  ${app} install --uninstall --all --yes`,
    "",
    "Use --dry to preview changes without writing files.",
    "Use --json for machine-readable output.",
  );
  return {
    key: "install",
    description:
      "Install this app, shell completions, agent skills, and MCP config on your machine.",
    options: installBuiltinOptions(root),
    notes: notesLines.join("\n"),
    handler: () => {},
  };
}
