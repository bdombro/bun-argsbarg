import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CliProgram } from "../../core/types.ts";
import { mcpServerId } from "../../mcp/tools.ts";
import { displayHomePath, userHome, xdgConfigHome } from "../../paths/host.ts";
import { skillDirName } from "../../skill/naming.ts";

export interface InstallPaths {
  agentsSkillDir: string;
  agentsMcpPath: string;
  mcpName: string;
  skillDirName: string;
}

export { userHome } from "../../paths/host.ts";

/** Format an absolute path for user-facing install output. */
export function displayInstallPath(path: string): string {
  return displayHomePath(path);
}

/** Resolves Claude Desktop `claude_desktop_config.json` for the current OS (manual setup docs). */
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

/** Resolves all install artifact paths for a program root. */
export function resolveInstallPaths(root: CliProgram): InstallPaths {
  const home = userHome();
  const dirName = skillDirName(root.key);

  return {
    agentsSkillDir: join(home, ".agents", "skills", dirName),
    agentsMcpPath: join(home, ".agents", "mcp.json"),
    mcpName: mcpServerId(root),
    skillDirName: dirName,
  };
}
