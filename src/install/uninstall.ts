import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CliProgram } from "../types.ts";
import { uninstallBinary } from "./binary.ts";
import { uninstallCompletions } from "./completions.ts";
import { detectInstalledArtifacts } from "./detect-installed.ts";
import { removeMcpConfig } from "./mcp-config.ts";
import { InstallPaths, userHome } from "./paths.ts";
import type { InstallOpts } from "./plan.ts";

export interface UninstallAction {
  summary: string;
  message: string;
  run: () => string[];
}

function scopeAll(opts: InstallOpts): boolean {
  return !opts.bin && !opts.completions && !opts.skill && !opts.mcp;
}

/** Builds uninstall actions from detected artifacts. */
export function buildUninstallPlan(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
): UninstallAction[] {
  const detected = detectInstalledArtifacts(paths);
  const all = scopeAll(opts);
  const dry = !!opts.dry;
  const actions: UninstallAction[] = [];

  if ((all || opts.bin) && detected.binary) {
    actions.push({
      summary: `binary: ${paths.binaryPath}`,
      message: `Removing binary ${paths.binaryPath}`,
      run: () => uninstallBinary(root, paths, dry),
    });
  }

  if ((all || opts.completions) && (detected.bashCompletion || detected.zshCompletion || detected.fishCompletion)) {
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

  if ((all || opts.skill) && detected.cursorSkill) {
    actions.push({
      summary: `cursor skill: ${paths.cursorSkillDir}/`,
      message: `Removing Cursor skill ${paths.cursorSkillDir}/`,
      run: () => [],
    });
  }

  if ((all || opts.skill) && detected.claudeSkill) {
    actions.push({
      summary: `claude skill: ${paths.claudeSkillDir}/`,
      message: `Removing Claude Code skill ${paths.claudeSkillDir}/`,
      run: () => [],
    });
  }

  if ((all || opts.mcp) && root.mcpServer !== undefined) {
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
        summary: `claude mcp: ${paths.claudeMcpPath}`,
        message: `Removing MCP server "${paths.mcpName}" from ${paths.claudeMcpPath}`,
        run: () => {
          removeMcpConfig(paths.claudeMcpPath, paths.mcpName, dry);
          return [paths.claudeMcpPath];
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
  return [dir + "/"];
}
