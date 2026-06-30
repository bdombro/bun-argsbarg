import { existsSync } from "node:fs";
import type { CliProgram } from "../../types.ts";
import { installApp, uninstallApp } from "../app.ts";
import { displayInstallPath, type InstallPaths } from "../paths.ts";
import { InstallTarget } from "../target-base.ts";
import type {
  DetectedSnapshot,
  InstallAction,
  InstalledArtifacts,
  InstallStatus,
  TargetPlanContext,
  UninstallAction,
} from "../target-types.ts";

/** Installs the compiled app to ~/.local/bin/<key>. */
class AppInstallTarget extends InstallTarget {
  readonly key = "app" as const;
  readonly actionKind = "app" as const;
  readonly category = "core" as const;

  isAvailable(_root: CliProgram, _paths: InstallPaths): boolean {
    return true;
  }

  isDetected(paths: InstallPaths, _root: CliProgram): boolean {
    return existsSync(paths.appPath);
  }

  applyDetected(paths: InstallPaths, root: CliProgram, out: InstalledArtifacts): void {
    out.app = this.isDetected(paths, root);
  }

  protected isDetectedFromSnapshot(detected: DetectedSnapshot): boolean {
    return detected.app;
  }

  protected formatStatusLine(paths: InstallPaths, _root: CliProgram): string {
    return displayInstallPath(paths.appPath);
  }

  protected assignStatusLine(status: InstallStatus, line: string): void {
    status.app = line;
  }

  protected buildInstallActions(ctx: TargetPlanContext): InstallAction[] {
    const sourcePath = ctx.opts.from ?? process.execPath;
    return [
      {
        kind: this.actionKind,
        summary: `app: ${displayInstallPath(ctx.paths.appPath)}`,
        message: `Installing app to ${displayInstallPath(ctx.paths.appPath)}`,
        run: () => installApp(ctx.root, ctx.paths, ctx.dry, sourcePath).changedFiles,
      },
    ];
  }

  protected buildUninstallActions(ctx: TargetPlanContext): UninstallAction[] {
    return [
      {
        kind: this.actionKind,
        summary: `app: ${displayInstallPath(ctx.paths.appPath)}`,
        message: `Removing app ${displayInstallPath(ctx.paths.appPath)}`,
        run: () => uninstallApp(ctx.root, ctx.paths, ctx.dry),
      },
    ];
  }
}

export const appTarget = new AppInstallTarget();
