/** Capability-aware labels for configure builtin and docs copy. */

import type { CliProgram } from "../core/types.ts";
import type { CliCapabilities } from "../runtime/capabilities.ts";

type Kind = "skills" | "mcp" | "config";

const LABEL: Record<Kind, { prose: string; short: string }> = {
  skills: { prose: "agent skills", short: "skills" },
  mcp: { prose: "MCP config", short: "MCP" },
  config: { prose: "app config", short: "config" },
};

function enabledKinds(program: CliProgram, caps: CliCapabilities): Kind[] {
  const kinds: Kind[] = [];
  if (program.skill?.enabled) kinds.push("skills");
  if (caps.mcp && program.mcpServer?.enabled) kinds.push("mcp");
  if (program.appConfig && Object.keys(program.appConfig.entries).length > 0) kinds.push("config");
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

/** True when brew caveats should mention `configure install` / `configure uninstall`. */
export function needsConfigureCaveats(program: CliProgram, caps: CliCapabilities): boolean {
  return enabledKinds(program, caps).length > 0;
}

export function configureCommandDescription(program: CliProgram, caps: CliCapabilities): string {
  return `Set up ${prose(program, caps)} for this app (binary via Homebrew).`;
}

export function docsSkillTopicDescription(_program: CliProgram, caps: CliCapabilities): string {
  if (caps.configure) {
    return "Print a reference agent SKILL; run `configure install` to install an optimized copy.";
  }
  return "Print a reference agent SKILL for AI agents.";
}

export function configureCommandNotes(program: CliProgram, _caps: CliCapabilities): string {
  const app = program.key;
  const lines = [
    "Set up agent artifacts after the binary is installed via Homebrew (see README for tap install).",
    "",
    "Homebrew installs the binary and shell completions only. Agent artifacts live under ~/.agents and are not written during brew install.",
    "",
    "After install or upgrade:",
    `  ${app} configure install`,
    "",
    "Upgrade:",
    `  brew upgrade ${app}`,
    `  ${app} configure install`,
    "",
    "Shell completions are installed by Homebrew during brew install.",
    "See: https://docs.brew.sh/Shell-Completion",
    "",
    "See what is installed:",
    `  ${app} configure status`,
    "",
    "Uninstall:",
    `  ${app} configure uninstall`,
    `  brew uninstall <tap>/${app}`,
    "",
  ];
  if (program.appConfig && Object.keys(program.appConfig.entries).length > 0) {
    lines.push("Set configuration values:", `  ${app} configure set <key> <value>`, "");
  }
  lines.push("Use `configure status --json` for machine-readable output.");
  return lines.join("\n");
}
