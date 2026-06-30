import type { CliProgram } from "../types.ts";
import {
  checkMcpConflict,
  expectedMcpEntry,
  mergeMcpConfig,
  readMcpServerEntry,
  removeMcpConfig,
} from "./mcp-config.ts";
import { displayInstallPath, type InstallPaths } from "./paths.ts";
import { InstallTarget } from "./target-base.ts";
import type {
  CliInstallArtifactKey,
  DetectedSnapshot,
  InstallAction,
  InstallActionKind,
  InstalledArtifacts,
  InstallStatus,
  TargetPlanContext,
  UninstallAction,
} from "./target-types.ts";

export interface McpJsonHostSpec {
  key: CliInstallArtifactKey;
  actionKind: InstallActionKind;
  label: string;
  pairedSkillKey?: CliInstallArtifactKey;
  configPath: (paths: InstallPaths) => string;
  detectedKey: keyof Pick<
    InstalledArtifacts,
    "cursorMcp" | "claudeMcp" | "claudeDesktopMcp" | "chatGptMcp"
  >;
  statusField: keyof Pick<
    InstallStatus,
    "cursorMcp" | "claudeMcp" | "claudeDesktopMcp" | "chatGptMcp"
  >;
  isAvailable: (root: CliProgram, paths: InstallPaths) => boolean;
  /** Append server name to status line (default false). */
  statusIncludesServer?: boolean;
}

function mcpConfigHasServer(path: string, name: string): boolean {
  return readMcpServerEntry(path, name) !== undefined;
}

/** MCP host that merges into a JSON `mcpServers` config file. */
export class McpJsonInstallTarget extends InstallTarget {
  readonly key: CliInstallArtifactKey;
  readonly actionKind: InstallActionKind;
  readonly category = "mcp" as const;
  readonly pairedKey?: CliInstallArtifactKey;

  private readonly spec: McpJsonHostSpec;

  constructor(spec: McpJsonHostSpec) {
    super();
    this.spec = spec;
    this.key = spec.key;
    this.actionKind = spec.actionKind;
    this.pairedKey = spec.pairedSkillKey;
  }

  isAvailable(root: CliProgram, paths: InstallPaths): boolean {
    return this.spec.isAvailable(root, paths);
  }

  isDetected(paths: InstallPaths, _root: CliProgram): boolean {
    return mcpConfigHasServer(this.spec.configPath(paths), paths.mcpName);
  }

  applyDetected(paths: InstallPaths, root: CliProgram, out: InstalledArtifacts): void {
    out[this.spec.detectedKey] = this.isDetected(paths, root);
  }

  protected isDetectedFromSnapshot(detected: DetectedSnapshot): boolean {
    return detected[this.spec.detectedKey];
  }

  protected formatStatusLine(paths: InstallPaths, _root: CliProgram): string {
    const path = displayInstallPath(this.spec.configPath(paths));
    if (this.spec.statusIncludesServer) {
      return `${path} (server "${paths.mcpName}")`;
    }
    return path;
  }

  protected assignStatusLine(status: InstallStatus, line: string): void {
    status[this.spec.statusField] = line;
  }

  preflight(ctx: TargetPlanContext): string | null {
    const entry = expectedMcpEntry(ctx.root);
    return checkMcpConflict(
      this.spec.configPath(ctx.paths),
      ctx.paths.mcpName,
      entry,
      !!ctx.opts.yes,
    );
  }

  protected buildInstallActions(ctx: TargetPlanContext): InstallAction[] {
    const configPath = this.spec.configPath(ctx.paths);
    const entry = expectedMcpEntry(ctx.root);
    return [
      {
        kind: this.actionKind,
        summary: `${this.spec.label}: ${displayInstallPath(configPath)}`,
        message: `Merging MCP server "${ctx.paths.mcpName}" into ${displayInstallPath(configPath)}`,
        run: () => {
          mergeMcpConfig(configPath, ctx.paths.mcpName, entry, ctx.dry);
          return [configPath];
        },
      },
    ];
  }

  protected buildUninstallActions(ctx: TargetPlanContext): UninstallAction[] {
    const configPath = this.spec.configPath(ctx.paths);
    return [
      {
        kind: this.actionKind,
        summary: `${this.spec.label}: ${displayInstallPath(configPath)}`,
        message: `Removing MCP server "${ctx.paths.mcpName}" from ${displayInstallPath(configPath)}`,
        run: () => {
          removeMcpConfig(configPath, ctx.paths.mcpName, ctx.dry);
          return [configPath];
        },
      },
    ];
  }
}
