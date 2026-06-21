import { resolveCapabilities } from "../capabilities.ts";
import { CliProgram, CliOption, CliOptionKind, type CliLeaf } from "../types.ts";

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
      description: "Remove installed artifacts (use --all or scoped flags; skips targets not on disk).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "prefix",
      description: "Install directory for the binary (default ~/.local/bin; overrides INSTALL_PREFIX).",
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
      description: "Suppress informational output (requires --yes).",
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

  return opts;
}

/** Builds the `install` built-in command. */
export function cliBuiltinInstallCommand(root: CliProgram): CliLeaf {
  const app = root.key;
  return {
    key: "install",
    description: "Install the binary, shell completions, agent skills, and MCP config to your user environment.",
    notes:
      "First-time setup:\n" +
      `  ${app} install --all --yes\n\n` +
      "Refresh after upgrading:\n" +
      `  ${app} install --reinstall\n` +
      `  ${app} update\n\n` +
      "See what is installed:\n" +
      `  ${app} install --status\n\n` +
      "Remove everything installed with --all:\n" +
      `  ${app} install --uninstall --all --yes\n\n` +
      "Use --dry to preview changes, --json for machine-readable output.",
    options: installBuiltinOptions(root),
    handler: () => {},
  };
}
