/** Capability-aware labels for configure builtin and docs copy. */

import type { CliCapabilities } from "../capabilities.ts";
import type { CliProgram } from "../types.ts";

type Kind = "skills" | "mcp" | "config";

const LABEL: Record<Kind, { prose: string; short: string }> = {
  skills: { prose: "agent skills", short: "skills" },
  mcp: { prose: "MCP config", short: "MCP" },
  config: { prose: "app config", short: "config" },
};

function enabledKinds(program: CliProgram, caps: CliCapabilities): Kind[] {
  const kinds: Kind[] = ["skills"];
  if (caps.mcp) kinds.push("mcp");
  if (program.appConfig) kinds.push("config");
  return kinds;
}

function joinEnglish(items: string[]): string {
  if (items.length === 0) return "agent artifacts";
  if (items.length === 1) return items[0] ?? "agent artifacts";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function prose(program: CliProgram, caps: CliCapabilities): string {
  return joinEnglish(enabledKinds(program, caps).map((k) => LABEL[k].prose));
}

function short(program: CliProgram, caps: CliCapabilities): string {
  return joinEnglish(enabledKinds(program, caps).map((k) => LABEL[k].short));
}

export function configureCommandDescription(program: CliProgram, caps: CliCapabilities): string {
  return `Set up ${prose(program, caps)} for this app (binary via Homebrew).`;
}

export function configureSyncOptionDescription(program: CliProgram, caps: CliCapabilities): string {
  return `Refresh installed ${short(program, caps)}. Used by Homebrew post_install.`;
}

export function docsSkillTopicDescription(_program: CliProgram, caps: CliCapabilities): string {
  if (caps.configure) {
    return "Print a reference agent SKILL; run `configure` to install an optimized copy.";
  }
  return "Print a reference agent SKILL for AI agents.";
}

export function configureCommandNotes(program: CliProgram, _caps: CliCapabilities): string {
  const app = program.key;
  const lines = [
    "Set up agent artifacts after the binary is installed via Homebrew (see README for tap install).",
    "",
    "Homebrew post_install runs:",
    `  ${app} configure --sync --yes`,
    "",
    "Interactive setup (per target):",
    `  ${app} configure`,
    "",
    "Upgrade:",
    `  brew upgrade ${app}`,
    "",
    "Shell completions are installed by Homebrew during brew install.",
    "See: https://docs.brew.sh/Shell-Completion",
    "",
    "See what is installed:",
    `  ${app} configure --status`,
    "",
    "Uninstall:",
    `  brew uninstall <tap>/${app}`,
    "",
    "The formula uninstall hook runs `configure --remove-all --yes` (skills, MCP, and app config).",
    "",
  ];
  if (program.appConfig) {
    lines.push("Remove app config only:", `  ${app} configure --remove-config --yes`, "");
  }
  lines.push("Use --dry to preview changes without writing files.", "Use --json for machine-readable output.");
  return lines.join("\n");
}
