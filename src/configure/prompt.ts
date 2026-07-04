/*
TTY prompts for per-target install, skip, or uninstall during interactive `configure`.
*/

import { readSync } from "node:fs";
import type { CliInstallArtifactKey } from "../install/target-types.ts";

/** Human-readable labels for each install artifact key in interactive prompts. */
const LABELS: Record<CliInstallArtifactKey, string> = {
  app: "App binary",
  cursorSkill: "Cursor skill",
  claudeSkill: "Claude skill",
  codexSkill: "Codex skill",
  opencodeSkill: "OpenCode skill",
  openclawSkill: "OpenClaw skill",
  cursorMcp: "Cursor MCP",
  claudeCodeMcp: "Claude Code MCP",
  claudeDesktopMcp: "Claude Desktop MCP",
  opencodeMcp: "OpenCode MCP",
  codexMcp: "Codex MCP",
  openclawMcp: "OpenClaw MCP",
  chatgptMcp: "ChatGPT desktop MCP",
  configure: "App config",
};

/** Returns the prompt label for an install artifact key. */
export function artifactPromptLabel(key: CliInstallArtifactKey): string {
  return LABELS[key];
}

/** User choice from a per-target Y/n or y/N prompt. */
export type TargetPromptAction = "install" | "skip" | "uninstall";

/** Prompt per target: Y/n when not installed, y/N when installed. */
export function promptTargetAction(label: string, installed: boolean): TargetPromptAction | null {
  const hint = installed ? `${label} [y/N]: ` : `${label} [Y/n]: `;
  process.stderr.write(hint);
  const buf = Buffer.alloc(256);
  const n = readSync(0, buf, { length: 256 });
  const ans = buf.toString("utf8", 0, n).trim().toLowerCase();
  if (installed) {
    if (ans === "n") return "uninstall";
    return "skip";
  }
  if (ans === "n") return "skip";
  return "install";
}
