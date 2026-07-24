import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CliProgram } from "~/core/types.ts";
import { mcpServerId, sanitizeToolSegment } from "~/mcp/tools.ts";
import { displayHomePath, userHome, xdgConfigHome } from "~/paths/host.ts";
import { skillDirNameForTarget } from "~/skill/install.ts";
import { resolveOpenclawConfigPath } from "./mcp-openclaw.ts";
import { resolveOpenCodeConfigPathForInstall } from "./mcp-opencode.ts";

export interface InstallPaths {
  cursorSkillDir: string;
  claudeSkillDir: string;
  codexSkillDir: string;
  opencodeSkillDir: string;
  openclawSkillDir: string;
  cursorMcpPath: string;
  claudeMcpPath: string;
  claudeDesktopMcpPath: string;
  opencodeMcpPath: string;
  chatGptMcpPath: string;
  codexConfigPath: string;
  openclawConfigPath: string;
  mcpName: string;
  skillDirName: string;
}

export { userHome } from "~/paths/host.ts";

/** Format an absolute path for user-facing install output. */
export function displayInstallPath(path: string): string {
  return displayHomePath(path);
}

/** Resolves Claude Desktop `claude_desktop_config.json` for the current OS. */
export function resolveClaudeDesktopMcpPath(home: string): string {
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  return join(xdgConfigHome(home), "Claude", "claude_desktop_config.json");
}

/** True when Claude Desktop app data exists (config file or app support directory). */
export function claudeDesktopPresent(_home: string, configPath: string): boolean {
  return existsSync(configPath) || existsSync(dirname(configPath));
}

/** Resolves ChatGPT desktop `chatgpt_mcp_config.json` for the current OS. */
export function resolveChatGptMcpPath(home: string): string {
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "ChatGPT", "chatgpt_mcp_config.json");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "OpenAI", "ChatGPT", "chatgpt_mcp_config.json");
  }
  return join(xdgConfigHome(home), "ChatGPT", "chatgpt_mcp_config.json");
}

/** True when ChatGPT desktop app data exists (config file or app support directory). */
export function chatGptDesktopPresent(_home: string, configPath: string): boolean {
  return existsSync(configPath) || existsSync(dirname(configPath));
}

/** Resolves all install artifact paths for a program root. */
export function resolveInstallPaths(root: CliProgram): InstallPaths {
  const home = userHome();
  const skillDirName = sanitizeToolSegment(root.key);
  const codexSlug = skillDirNameForTarget(root.key, "codex");
  const opencodeSlug = skillDirNameForTarget(root.key, "opencode");
  const openclawSlug = skillDirNameForTarget(root.key, "openclaw");
  const claudeDesktopMcpPath = resolveClaudeDesktopMcpPath(home);
  const chatGptMcpPath = resolveChatGptMcpPath(home);

  return {
    cursorSkillDir: join(home, ".cursor", "skills", skillDirName),
    claudeSkillDir: join(home, ".claude", "skills", skillDirName),
    codexSkillDir: join(home, ".codex", "skills", codexSlug),
    opencodeSkillDir: join(home, ".config", "opencode", "skills", opencodeSlug),
    openclawSkillDir: join(home, ".openclaw", "skills", openclawSlug),
    cursorMcpPath: join(home, ".cursor", "mcp.json"),
    claudeMcpPath: join(home, ".claude.json"),
    claudeDesktopMcpPath,
    opencodeMcpPath: resolveOpenCodeConfigPathForInstall(home),
    chatGptMcpPath,
    codexConfigPath: join(home, ".codex", "config.toml"),
    openclawConfigPath: resolveOpenclawConfigPath(home),
    mcpName: mcpServerId(root),
    skillDirName,
  };
}
