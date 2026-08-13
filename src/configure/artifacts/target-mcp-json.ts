import type { CliProgram } from "../../core/types.ts";
import { expectedMcpEntry, installMcpServerEntry, readMcpServerEntry, removeMcpConfig } from "./mcp-config.ts";
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
  configPath: (paths: InstallPaths) => string;
  detectedKey: keyof Pick<InstalledArtifacts, "agentsMcp">;
  statusField: keyof Pick<InstallStatus, "agentsMcp">;
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

  private readonly spec: McpJsonHostSpec;

  constructor(spec: McpJsonHostSpec) {
    super();
    this.spec = spec;
    this.key = spec.key;
    this.actionKind = spec.actionKind;
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

  preflight(_ctx: TargetPlanContext): string | null {
    return null;
  }

  protected buildInstallActions(ctx: TargetPlanContext): InstallAction[] {
    const configPath = this.spec.configPath(ctx.paths);
    const entry = expectedMcpEntry(ctx.root);
    const displayPath = displayInstallPath(configPath);
    return [
      {
        kind: this.actionKind,
        summary: `${this.spec.label}: ${displayPath}`,
        message: `Merging MCP server "${ctx.paths.mcpName}" into ${displayPath}`,
        run: () => {
          const result = installMcpServerEntry(configPath, ctx.paths.mcpName, entry);
          if (result === "installed") {
            process.stdout.write(`Registered MCP server in ${displayPath}\n`);
          }
          return result === "installed" ? [configPath] : [];
        },
      },
    ];
  }

  protected buildUninstallActions(ctx: TargetPlanContext): UninstallAction[] {
    const configPath = this.spec.configPath(ctx.paths);
    const displayPath = displayInstallPath(configPath);
    return [
      {
        kind: this.actionKind,
        summary: `${this.spec.label}: ${displayPath}`,
        message: `Removing MCP server "${ctx.paths.mcpName}" from ${displayPath}`,
        run: () => {
          const changed = removeMcpConfig(configPath, ctx.paths.mcpName, ctx.dry);
          if (changed.length > 0 && !ctx.dry) {
            process.stdout.write(`Removed MCP server from ${displayPath}\n`);
          }
          return changed;
        },
      },
    ];
  }
}
