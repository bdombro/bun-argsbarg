import type { InstallTarget } from "../target-base.ts";
import { appTarget } from "./app.ts";
import { chatgptMcpTarget } from "./chatgpt-mcp.ts";
import { claudeCodeMcpTarget } from "./claude-code-mcp.ts";
import { claudeDesktopMcpTarget } from "./claude-desktop-mcp.ts";
import { claudeSkillTarget } from "./claude-skill.ts";
import { codexMcpTarget } from "./codex-mcp.ts";
import { codexSkillTarget } from "./codex-skill.ts";
import { completionsTarget } from "./completions.ts";
import { configureTarget } from "./configure.ts";
import { cursorMcpTarget } from "./cursor-mcp.ts";
import { cursorSkillTarget } from "./cursor-skill.ts";
import { openclawMcpTarget } from "./openclaw-mcp.ts";
import { openclawSkillTarget } from "./openclaw-skill.ts";
import { opencodeMcpTarget } from "./opencode-mcp.ts";
import { opencodeSkillTarget } from "./opencode-skill.ts";

/** Ordered install targets (plan iteration order). */
export const INSTALL_TARGETS: InstallTarget[] = [
  appTarget,
  completionsTarget,
  cursorSkillTarget,
  claudeSkillTarget,
  codexSkillTarget,
  opencodeSkillTarget,
  openclawSkillTarget,
  cursorMcpTarget,
  claudeCodeMcpTarget,
  claudeDesktopMcpTarget,
  opencodeMcpTarget,
  codexMcpTarget,
  openclawMcpTarget,
  chatgptMcpTarget,
  configureTarget,
];

export {
  appTarget,
  chatgptMcpTarget,
  claudeCodeMcpTarget,
  claudeDesktopMcpTarget,
  claudeSkillTarget,
  codexMcpTarget,
  codexSkillTarget,
  completionsTarget,
  configureTarget,
  cursorMcpTarget,
  cursorSkillTarget,
  openclawMcpTarget,
  openclawSkillTarget,
  opencodeMcpTarget,
  opencodeSkillTarget,
};
