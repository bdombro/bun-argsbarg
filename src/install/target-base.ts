import type { CliProgram, InstallAgentIntegration } from "../types.ts";
import type { InstallPaths } from "./paths.ts";
import type {
  CliInstallArtifactKey,
  DetectedSnapshot,
  InstallAction,
  InstallActionKind,
  InstalledArtifacts,
  InstallStatus,
  InstallTargetCategory,
  TargetPlanContext,
  UninstallAction,
} from "./target-types.ts";

/** Shared lifecycle for one install artifact. */
export abstract class InstallTarget {
  abstract readonly key: CliInstallArtifactKey;
  abstract readonly actionKind: InstallActionKind;
  abstract readonly category: InstallTargetCategory;

  /** Paired MCP/skill key for agentIntegration dedupe. */
  readonly pairedKey?: CliInstallArtifactKey;

  defaultIncludedInAll(integration: InstallAgentIntegration): boolean {
    if (this.category === "core") return true;
    if (this.category === "mcp") {
      return integration === "mcp" || integration === "both";
    }
    return integration === "skill" || integration === "both";
  }

  abstract isAvailable(root: CliProgram, paths: InstallPaths): boolean;

  /** Whether this artifact is installed (for scoped uninstall / refresh). */
  abstract isDetected(paths: InstallPaths, root: CliProgram): boolean;

  /** Writes detection flags into the shared snapshot. */
  applyDetected(_paths: InstallPaths, _root: CliProgram, _out: InstalledArtifacts): void {
    // default: subclasses override
  }

  /** Maps artifact key to detected boolean for plan scoping. */
  detectedForSnapshot(detected: DetectedSnapshot): boolean {
    return this.isDetectedFromSnapshot(detected);
  }

  protected abstract isDetectedFromSnapshot(detected: DetectedSnapshot): boolean;

  statusLine(
    paths: InstallPaths,
    root: CliProgram,
    detected: InstalledArtifacts,
  ): string | undefined {
    if (!this.isDetectedFromInstalled(detected)) return undefined;
    return this.formatStatusLine(paths, root);
  }

  protected isDetectedFromInstalled(detected: InstalledArtifacts): boolean {
    return this.isDetectedFromSnapshot(detected as DetectedSnapshot);
  }

  protected abstract formatStatusLine(paths: InstallPaths, root: CliProgram): string;

  planInstall(ctx: TargetPlanContext): InstallAction[] {
    if (!ctx.include(this.key)) return [];
    return this.buildInstallActions(ctx);
  }

  planUninstall(ctx: TargetPlanContext): UninstallAction[] {
    if (!ctx.include(this.key)) return [];
    if (!this.isDetectedFromSnapshot(ctx.detected)) return [];
    return this.buildUninstallActions(ctx);
  }

  preflight?(ctx: TargetPlanContext): string | null;

  protected abstract buildInstallActions(ctx: TargetPlanContext): InstallAction[];

  protected abstract buildUninstallActions(ctx: TargetPlanContext): UninstallAction[];

  contributeStatus(
    paths: InstallPaths,
    root: CliProgram,
    detected: InstalledArtifacts,
    status: InstallStatus,
  ): void {
    const line = this.statusLine(paths, root, detected);
    if (!line) return;
    this.assignStatusLine(status, line);
  }

  protected abstract assignStatusLine(status: InstallStatus, line: string): void;
}
