import { resolveCapabilities } from "../capabilities.ts";
import { type CliLeaf, type CliOption, CliOptionKind, type CliProgram } from "../types.ts";

/** Install command options (dynamic: `--mcp` only when MCP is enabled). */
export function installBuiltinOptions(root: CliProgram): CliOption[] {
  const opts: CliOption[] = [
    {
      name: "all",
      description: "Install binary, completions, skills, and MCP config (when enabled).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "bin",
      description: "Copy this binary to your install directory (default ~/.local/bin).",
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
      description: "Install Cursor and Claude Code skills when ~/.cursor or ~/.claude exists.",
      kind: CliOptionKind.Presence,
    },
    {
      name: "reinstall",
      description: "Reinstall artifacts already on disk (always includes the binary).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "from",
      description: "Binary to copy (default: running executable). Used with --reinstall.",
      kind: CliOptionKind.String,
    },
    {
      name: "status",
      description: "Print what is currently installed (read-only).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "uninstall",
      description:
        "Remove installed artifacts (use --all or scoped flags; skips targets not on disk).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "prefix",
      description:
        "Install directory for the binary (default ~/.local/bin; overrides INSTALL_PREFIX).",
      kind: CliOptionKind.String,
    },
    {
      name: "yes",
      description: "Skip the confirmation prompt.",
      kind: CliOptionKind.Presence,
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
    {
      name: "quiet",
      description:
        "Suppress informational output (requires --yes, --json, --reinstall, or --update).",
      kind: CliOptionKind.Presence,
    },
  ];

  if (resolveCapabilities(root).mcp) {
    opts.splice(4, 0, {
      name: "mcp",
      description: "Add or update MCP server entries in Cursor and Claude config files.",
      kind: CliOptionKind.Presence,
    });
  }

  if (resolveCapabilities(root).update) {
    const statusIdx = opts.findIndex((o) => o.name === "status");
    opts.splice(statusIdx, 0, {
      name: "update",
      description: "Download the latest release and reinstall installed artifacts.",
      kind: CliOptionKind.Presence,
    });
  }

  return opts;
}

/** Builds the `install` built-in command. */
export function cliBuiltinInstallCommand(root: CliProgram): CliLeaf {
  const app = root.key;
  const notesLines = [
    "First-time setup:",
    `  ${app} install --all --yes`,
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
      "Install the binary, shell completions, agent skills, and MCP config to your user environment.",
    notes: notesLines.join("\n"),
    options: installBuiltinOptions(root),
    handler: () => {},
  };
}
