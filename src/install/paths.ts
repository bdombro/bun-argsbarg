import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { mcpServerId, sanitizeToolSegment } from "../mcp/tools.ts";
import { expandTilde, userHome, xdgConfigHome } from "../paths/host.ts";
import type { CliProgram } from "../types.ts";
import { resolveOpenCodeConfigPathForInstall } from "./mcp-opencode.ts";

export interface InstallPaths {
  bindir: string;
  binaryPath: string;
  bashCompletion: string;
  zshCompletion: string;
  fishCompletion: string;
  cursorSkillDir: string;
  claudeSkillDir: string;
  cursorMcpPath: string;
  claudeMcpPath: string;
  claudeDesktopMcpPath: string;
  opencodeMcpPath: string;
  chatGptMcpPath: string;
  codexConfigPath: string;
  bashRc: string;
  zshRc: string;
  mcpName: string;
  skillDirName: string;
}

export { userHome } from "../paths/host.ts";

/** Resolves the binary install directory from CLI flag, env, or config. */
export function resolveBindir(root: CliProgram, prefix?: string): string {
  const raw = prefix ?? process.env.INSTALL_PREFIX ?? root.install?.prefix;
  if (raw) {
    return expandTilde(raw);
  }
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
export function resolveInstallPaths(root: CliProgram, opts: { prefix?: string }): InstallPaths {
  const home = userHome();
  const bindir = resolveBindir(root, opts.prefix);
  const key = root.key;
  const skillDirName = sanitizeToolSegment(root.key);
  const xdgConfig = xdgConfigHome(home);
  const claudeDesktopMcpPath = resolveClaudeDesktopMcpPath(home);
  const chatGptMcpPath = resolveChatGptMcpPath(home);

  return {
    bindir,
    binaryPath: join(bindir, key),
    bashCompletion: join(home, ".bash_completion.d", key),
    zshCompletion: join(home, ".zsh", "completions", `_${key}`),
    fishCompletion: join(xdgConfig, "fish", "completions", `${key}.fish`),
    cursorSkillDir: join(home, ".cursor", "skills", skillDirName),
    claudeSkillDir: join(home, ".claude", "skills", skillDirName),
    cursorMcpPath: join(home, ".cursor", "mcp.json"),
    claudeMcpPath: join(home, ".claude.json"),
    claudeDesktopMcpPath,
    opencodeMcpPath: resolveOpenCodeConfigPathForInstall(home),
    chatGptMcpPath,
    codexConfigPath: join(home, ".codex", "config.toml"),
    bashRc: join(home, ".bashrc"),
    zshRc: join(home, ".zshrc"),
    mcpName: mcpServerId(root),
    skillDirName,
  };
}
