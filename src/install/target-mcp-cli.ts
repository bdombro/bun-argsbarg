import type { CliProgram } from "../types.ts";
import {
  checkCodexMcpConflict,
  codexMcpHasServer,
  mergeCodexMcpConfig,
  removeCodexMcpConfig,
} from "./mcp-codex.ts";
import { expectedMcpEntry } from "./mcp-config.ts";
import {
  checkOpenclawMcpConflict,
  mergeOpenclawMcpConfig,
  openclawMcpHasServer,
  removeOpenclawMcpConfig,
} from "./mcp-openclaw.ts";
import { displayInstallPath, type InstallPaths, userHome } from "./paths.ts";
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

export interface McpCliHostSpec {
  key: CliInstallArtifactKey;
  actionKind: InstallActionKind;
  label: string;
  pairedSkillKey: CliInstallArtifactKey;
  configPath: (paths: InstallPaths) => string;
  detectedKey: "codexMcp" | "openclawMcp";
  statusField: "codexMcp" | "openclawMcp";
  isAvailable: (root: CliProgram, paths: InstallPaths) => boolean;
  hasServer: (home: string, name: string) => boolean;
  installMessage: string;
  uninstallMessage: string;
  merge: (
    home: string,
    name: string,
    entry: ReturnType<typeof expectedMcpEntry>,
    dry: boolean,
    yes: boolean,
  ) => string;
  remove: (home: string, name: string, dry: boolean) => void;
  preflight: (
    home: string,
    name: string,
    entry: ReturnType<typeof expectedMcpEntry>,
    yes: boolean,
  ) => string | null;
}

/** MCP host registered via an external CLI (codex, openclaw). */
export class McpCliInstallTarget extends InstallTarget {
  readonly key: CliInstallArtifactKey;
  readonly actionKind: InstallActionKind;
  readonly category = "mcp" as const;
  readonly pairedKey: CliInstallArtifactKey;

  private readonly spec: McpCliHostSpec;

  constructor(spec: McpCliHostSpec) {
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
    return this.spec.hasServer(userHome(), paths.mcpName);
  }

  applyDetected(paths: InstallPaths, root: CliProgram, out: InstalledArtifacts): void {
    out[this.spec.detectedKey] = this.isDetected(paths, root);
  }

  protected isDetectedFromSnapshot(detected: DetectedSnapshot): boolean {
    return detected[this.spec.detectedKey] ?? false;
  }

  protected formatStatusLine(paths: InstallPaths, _root: CliProgram): string {
    return `${displayInstallPath(this.spec.configPath(paths))} (server "${paths.mcpName}")`;
  }

  protected assignStatusLine(status: InstallStatus, line: string): void {
    status[this.spec.statusField] = line;
  }

  preflight(ctx: TargetPlanContext): string | null {
    const entry = expectedMcpEntry(ctx.root);
    return this.spec.preflight(userHome(), ctx.paths.mcpName, entry, !!ctx.opts.yes);
  }

  protected buildInstallActions(ctx: TargetPlanContext): InstallAction[] {
    const entry = expectedMcpEntry(ctx.root);
    const configPath = this.spec.configPath(ctx.paths);
    return [
      {
        kind: this.actionKind,
        summary: `${this.spec.label}: ${displayInstallPath(configPath)}`,
        message: this.spec.installMessage.replace("{name}", ctx.paths.mcpName),
        run: () => {
          const written = this.spec.merge(
            userHome(),
            ctx.paths.mcpName,
            entry,
            ctx.dry,
            !!ctx.opts.yes,
          );
          return [written];
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
        message: this.spec.uninstallMessage.replace("{name}", ctx.paths.mcpName),
        run: () => {
          this.spec.remove(userHome(), ctx.paths.mcpName, ctx.dry);
          return [configPath];
        },
      },
    ];
  }
}

export {
  checkCodexMcpConflict,
  checkOpenclawMcpConflict,
  codexMcpHasServer,
  mergeCodexMcpConfig,
  mergeOpenclawMcpConfig,
  openclawMcpHasServer,
  removeCodexMcpConfig,
  removeOpenclawMcpConfig,
};
