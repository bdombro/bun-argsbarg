import { existsSync, readFileSync } from "node:fs";
import { CliCommand } from "../types.ts";
import { InstallPaths } from "./paths.ts";

export interface InstalledArtifacts {
  binary: boolean;
  bashCompletion: boolean;
  zshCompletion: boolean;
  fishCompletion: boolean;
  cursorSkill: boolean;
  claudeSkill: boolean;
  cursorMcp: boolean;
  claudeMcp: boolean;
  bashRcPath: boolean;
  zshRcFpath: boolean;
}

function mcpConfigHasServer(path: string, name: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as { mcpServers?: Record<string, unknown> };
    return data.mcpServers?.[name] !== undefined;
  } catch {
    return false;
  }
}

/** Detects which install artifacts are currently present. */
export function detectInstalledArtifacts(paths: InstallPaths): InstalledArtifacts {
  return {
    binary: existsSync(paths.binaryPath),
    bashCompletion: existsSync(paths.bashCompletion),
    zshCompletion: existsSync(paths.zshCompletion),
    fishCompletion: existsSync(paths.fishCompletion),
    cursorSkill: existsSync(paths.cursorSkillDir),
    claudeSkill: existsSync(paths.claudeSkillDir),
    cursorMcp: mcpConfigHasServer(paths.cursorMcpPath, paths.mcpName),
    claudeMcp: mcpConfigHasServer(paths.claudeMcpPath, paths.mcpName),
    bashRcPath: false,
    zshRcFpath: false,
  };
}

export interface InstallStatus {
  binary?: string;
  bashCompletion?: string;
  zshCompletion?: string;
  fishCompletion?: string;
  cursorSkill?: string;
  claudeSkill?: string;
  cursorMcp?: string;
  claudeMcp?: string;
}

/** Builds a status inventory from detected artifacts. */
export function buildInstallStatus(paths: InstallPaths, detected: InstalledArtifacts): InstallStatus {
  const status: InstallStatus = {};
  if (detected.binary) status.binary = paths.binaryPath;
  if (detected.bashCompletion) status.bashCompletion = paths.bashCompletion;
  if (detected.zshCompletion) status.zshCompletion = paths.zshCompletion;
  if (detected.fishCompletion) status.fishCompletion = paths.fishCompletion;
  if (detected.cursorSkill) status.cursorSkill = paths.cursorSkillDir + "/";
  if (detected.claudeSkill) status.claudeSkill = paths.claudeSkillDir + "/";
  if (detected.cursorMcp) status.cursorMcp = `${paths.cursorMcpPath} (server "${paths.mcpName}")`;
  if (detected.claudeMcp) status.claudeMcp = `${paths.claudeMcpPath} (server "${paths.mcpName}")`;
  return status;
}
