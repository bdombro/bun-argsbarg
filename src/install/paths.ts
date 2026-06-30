import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { mcpServerId, sanitizeToolSegment } from "../mcp/tools.ts";
import { displayHomePath, userHome, xdgConfigHome } from "../paths/host.ts";
import { skillDirNameForTarget } from "../skill/install.ts";
import type { CliProgram } from "../types.ts";
import { resolveOpenclawConfigPath } from "./mcp-openclaw.ts";
import { resolveOpenCodeConfigPathForInstall } from "./mcp-opencode.ts";

export interface InstallPaths {
  appDir: string;
  appPath: string;
  bashCompletion: string;
  zshCompletion: string;
  fishCompletion: string;
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
  bashRc: string;
  zshRc: string;
  mcpName: string;
  skillDirName: string;
}

export { userHome } from "../paths/host.ts";

/** Format an absolute path for user-facing install output. */
export function displayInstallPath(path: string): string {
  return displayHomePath(path);
}

/** App install directory (`~/.local/bin`). */
export function resolveAppDir(): string {
  return join(userHome(), ".local", "bin");
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
  const appDir = resolveAppDir();
  const key = root.key;
  const skillDirName = sanitizeToolSegment(root.key);
  const codexSlug = skillDirNameForTarget(root.key, "codex");
  const opencodeSlug = skillDirNameForTarget(root.key, "opencode");
  const openclawSlug = skillDirNameForTarget(root.key, "openclaw");
  const xdgConfig = xdgConfigHome(home);
  const claudeDesktopMcpPath = resolveClaudeDesktopMcpPath(home);
  const chatGptMcpPath = resolveChatGptMcpPath(home);

  return {
    appDir,
    appPath: join(appDir, key),
    bashCompletion: join(home, ".bash_completion.d", key),
    zshCompletion: join(home, ".zsh", "completions", `_${key}`),
    fishCompletion: join(xdgConfig, "fish", "completions", `${key}.fish`),
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
    bashRc: join(home, ".bashrc"),
    zshRc: join(home, ".zshrc"),
    mcpName: mcpServerId(root),
    skillDirName,
  };
}
