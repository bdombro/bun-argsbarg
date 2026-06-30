import type { CliProgram } from "../../types.ts";
import {
  checkOpenCodeMcpConflict,
  detectOpenCodeMcpConfigPath,
  expectedOpenCodeMcpEntry,
  mergeOpenCodeMcpConfig,
  opencodePresent,
  removeOpenCodeMcpConfig,
} from "../mcp-opencode.ts";
import { displayInstallPath, type InstallPaths, userHome } from "../paths.ts";
import { InstallTarget } from "../target-base.ts";
import type {
  DetectedSnapshot,
  InstallAction,
  InstalledArtifacts,
  InstallStatus,
  TargetPlanContext,
  UninstallAction,
} from "../target-types.ts";

function resolveConfigPath(paths: InstallPaths, home: string): string {
  return detectOpenCodeMcpConfigPath(home, paths.mcpName) ?? paths.opencodeMcpPath;
}

/** OpenCode MCP (top-level `mcp` key, not `mcpServers`). */
class OpenCodeMcpInstallTarget extends InstallTarget {
  readonly key = "opencodeMcp" as const;
  readonly actionKind = "opencode-mcp" as const;
  readonly category = "mcp" as const;
  readonly pairedKey = "opencodeSkill" as const;

  isAvailable(_root: CliProgram, _paths: InstallPaths): boolean {
    return opencodePresent(userHome());
  }

  isDetected(paths: InstallPaths, _root: CliProgram): boolean {
    return detectOpenCodeMcpConfigPath(userHome(), paths.mcpName) !== undefined;
  }

  applyDetected(paths: InstallPaths, root: CliProgram, out: InstalledArtifacts): void {
    out.opencodeMcp = this.isDetected(paths, root);
  }

  protected isDetectedFromSnapshot(detected: DetectedSnapshot): boolean {
    return detected.opencodeMcp;
  }

  protected formatStatusLine(paths: InstallPaths, _root: CliProgram): string {
    const home = userHome();
    const path = detectOpenCodeMcpConfigPath(home, paths.mcpName) ?? paths.opencodeMcpPath;
    return `${displayInstallPath(path)} (server "${paths.mcpName}")`;
  }

  protected assignStatusLine(status: InstallStatus, line: string): void {
    status.opencodeMcp = line;
  }

  preflight(ctx: TargetPlanContext): string | null {
    const entry = expectedOpenCodeMcpEntry(ctx.root);
    return checkOpenCodeMcpConflict(
      ctx.paths.opencodeMcpPath,
      ctx.paths.mcpName,
      entry,
      !!ctx.opts.yes,
    );
  }

  protected buildInstallActions(ctx: TargetPlanContext): InstallAction[] {
    const entry = expectedOpenCodeMcpEntry(ctx.root);
    const configPath = ctx.paths.opencodeMcpPath;
    return [
      {
        kind: this.actionKind,
        summary: `opencode mcp: ${displayInstallPath(configPath)}`,
        message: `Merging MCP server "${ctx.paths.mcpName}" into ${displayInstallPath(configPath)}`,
        run: () => {
          mergeOpenCodeMcpConfig(configPath, ctx.paths.mcpName, entry, ctx.dry);
          return [configPath];
        },
      },
    ];
  }

  protected buildUninstallActions(ctx: TargetPlanContext): UninstallAction[] {
    const home = userHome();
    const configPath = resolveConfigPath(ctx.paths, home);
    return [
      {
        kind: this.actionKind,
        summary: `opencode mcp: ${displayInstallPath(configPath)}`,
        message: `Removing MCP server "${ctx.paths.mcpName}" from ${displayInstallPath(configPath)}`,
        run: () => {
          removeOpenCodeMcpConfig(configPath, ctx.paths.mcpName, ctx.dry);
          return [configPath];
        },
      },
    ];
  }
}

export const opencodeMcpTarget = new OpenCodeMcpInstallTarget();
