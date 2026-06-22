import { existsSync, rmSync } from "node:fs";
import type { CliProgram } from "../types.ts";
import { uninstallBinary } from "./binary.ts";
import { uninstallCompletions } from "./completions.ts";
import { detectInstalledArtifacts } from "./detect-installed.ts";
import { removeCodexMcpConfig } from "./mcp-codex.ts";
import { removeMcpConfig } from "./mcp-config.ts";
import { detectOpenCodeMcpConfigPath, removeOpenCodeMcpConfig } from "./mcp-opencode.ts";
import { type InstallPaths, userHome } from "./paths.ts";
import {
  type InstallOpts,
  wantsInstallBin,
  wantsInstallCompletions,
  wantsInstallMcp,
  wantsInstallSkill,
} from "./plan.ts";

export interface UninstallAction {
  summary: string;
  message: string;
  run: () => string[];
}

/** Builds uninstall actions for scoped targets (--all mirrors install --all). */
export function buildUninstallPlan(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
): UninstallAction[] {
  const detected = detectInstalledArtifacts(paths);
  const dry = !!opts.dry;
  const actions: UninstallAction[] = [];

  if (wantsInstallBin(opts) && detected.binary) {
    actions.push({
      summary: `binary: ${paths.binaryPath}`,
      message: `Removing binary ${paths.binaryPath}`,
      run: () => uninstallBinary(root, paths, dry),
    });
  }

  if (
    wantsInstallCompletions(opts) &&
    (detected.bashCompletion || detected.zshCompletion || detected.fishCompletion)
  ) {
    if (detected.bashCompletion) {
      actions.push({
        summary: `bash completion: ${paths.bashCompletion}`,
        message: `Removing bash completion ${paths.bashCompletion}`,
        run: () => uninstallCompletions(paths, dry).filter((p) => p === paths.bashCompletion),
      });
    }
    if (detected.zshCompletion) {
      actions.push({
        summary: `zsh completion: ${paths.zshCompletion}`,
        message: `Removing zsh completion ${paths.zshCompletion}`,
        run: () => uninstallCompletions(paths, dry).filter((p) => p === paths.zshCompletion),
      });
    }
    if (detected.fishCompletion) {
      actions.push({
        summary: `fish completion: ${paths.fishCompletion}`,
        message: `Removing fish completion ${paths.fishCompletion}`,
        run: () => uninstallCompletions(paths, dry).filter((p) => p === paths.fishCompletion),
      });
    }
  }

  if (wantsInstallSkill(opts) && detected.cursorSkill) {
    actions.push({
      summary: `cursor skill: ${paths.cursorSkillDir}/`,
      message: `Removing Cursor skill ${paths.cursorSkillDir}/`,
      run: () => [],
    });
  }

  if (wantsInstallSkill(opts) && detected.claudeSkill) {
    actions.push({
      summary: `claude skill: ${paths.claudeSkillDir}/`,
      message: `Removing Claude Code skill ${paths.claudeSkillDir}/`,
      run: () => [],
    });
  }

  if (wantsInstallMcp(opts, root)) {
    if (detected.cursorMcp) {
      actions.push({
        summary: `cursor mcp: ${paths.cursorMcpPath}`,
        message: `Removing MCP server "${paths.mcpName}" from ${paths.cursorMcpPath}`,
        run: () => {
          removeMcpConfig(paths.cursorMcpPath, paths.mcpName, dry);
          return [paths.cursorMcpPath];
        },
      });
    }
    if (detected.claudeMcp) {
      actions.push({
        summary: `claude code mcp: ${paths.claudeMcpPath}`,
        message: `Removing MCP server "${paths.mcpName}" from ${paths.claudeMcpPath}`,
        run: () => {
          removeMcpConfig(paths.claudeMcpPath, paths.mcpName, dry);
          return [paths.claudeMcpPath];
        },
      });
    }
    if (detected.claudeDesktopMcp) {
      actions.push({
        summary: `claude desktop mcp: ${paths.claudeDesktopMcpPath}`,
        message: `Removing MCP server "${paths.mcpName}" from ${paths.claudeDesktopMcpPath}`,
        run: () => {
          removeMcpConfig(paths.claudeDesktopMcpPath, paths.mcpName, dry);
          return [paths.claudeDesktopMcpPath];
        },
      });
    }
    if (detected.opencodeMcp) {
      const openCodePath =
        detectOpenCodeMcpConfigPath(userHome(), paths.mcpName) ?? paths.opencodeMcpPath;
      actions.push({
        summary: `opencode mcp: ${openCodePath}`,
        message: `Removing MCP server "${paths.mcpName}" from ${openCodePath}`,
        run: () => {
          removeOpenCodeMcpConfig(openCodePath, paths.mcpName, dry);
          return [openCodePath];
        },
      });
    }
    if (detected.codexMcp) {
      actions.push({
        summary: `codex mcp: ${paths.codexConfigPath}`,
        message: `Removing MCP server "${paths.mcpName}" from Codex via codex mcp remove`,
        run: () => {
          removeCodexMcpConfig(userHome(), paths.mcpName, dry);
          return [paths.codexConfigPath];
        },
      });
    }
    if (detected.chatGptMcp) {
      actions.push({
        summary: `chatgpt desktop mcp: ${paths.chatGptMcpPath}`,
        message: `Removing MCP server "${paths.mcpName}" from ${paths.chatGptMcpPath}`,
        run: () => {
          removeMcpConfig(paths.chatGptMcpPath, paths.mcpName, dry);
          return [paths.chatGptMcpPath];
        },
      });
    }
  }

  return actions;
}

/** Rimraf skill directories during uninstall. */
export function uninstallSkillDir(dir: string, dry: boolean): string[] {
  if (!existsSync(dir)) return [];
  if (!dry) rmSync(dir, { recursive: true, force: true });
  return [`${dir}/`];
}
