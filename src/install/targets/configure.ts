import { appConfigInstalled, displayAppConfigPath, uninstallAppConfig } from "../../config/file.ts";
import type { CliProgram } from "../../types.ts";
import type { InstallPaths } from "../paths.ts";
import { InstallTarget } from "../target-base.ts";
import type {
  DetectedSnapshot,
  InstallAction,
  InstalledArtifacts,
  InstallStatus,
  TargetPlanContext,
  UninstallAction,
} from "../target-types.ts";

/** App config file (install --configure / wizard). */
class ConfigureInstallTarget extends InstallTarget {
  readonly key = "configure" as const;
  readonly actionKind = "configure" as const;
  readonly category = "core" as const;

  isAvailable(root: CliProgram, _paths: InstallPaths): boolean {
    return root.appConfig !== undefined;
  }

  isDetected(_paths: InstallPaths, root: CliProgram): boolean {
    if (!root.appConfig) return false;
    return appConfigInstalled(root);
  }

  applyDetected(_paths: InstallPaths, _root: CliProgram, _out: InstalledArtifacts): void {}

  protected isDetectedFromSnapshot(detected: DetectedSnapshot): boolean {
    return detected.appConfig ?? false;
  }

  protected formatStatusLine(_paths: InstallPaths, root: CliProgram): string {
    return displayAppConfigPath(root);
  }

  protected assignStatusLine(_status: InstallStatus, _line: string): void {
    // configure status shown via appConfigStatus in status.ts
  }

  protected buildInstallActions(_ctx: TargetPlanContext): InstallAction[] {
    return [];
  }

  protected buildUninstallActions(ctx: TargetPlanContext): UninstallAction[] {
    return [
      {
        kind: "configure",
        summary: `app config: ${displayAppConfigPath(ctx.root)}`,
        message: `Removing app config ${displayAppConfigPath(ctx.root)}`,
        run: () => uninstallAppConfig(ctx.root, ctx.dry),
      },
    ];
  }
}

export const configureTarget = new ConfigureInstallTarget();
