import { isExternallyManagedBinary } from "~/configure/artifacts/binary-placement.ts";
import type { InstallPaths } from "~/configure/artifacts/paths.ts";
import { InstallTarget } from "~/configure/artifacts/target-base.ts";
import type {
  DetectedSnapshot,
  InstallAction,
  InstalledArtifacts,
  InstallStatus,
  TargetPlanContext,
  UninstallAction,
} from "~/configure/artifacts/target-types.ts";
import type { CliProgram } from "~/core/types.ts";

/** Reports app install location (Homebrew PATH or legacy ~/.local/bin). No self-install actions. */
class AppInstallTarget extends InstallTarget {
  readonly key = "app" as const;
  readonly actionKind = "app" as const;
  readonly category = "core" as const;

  defaultIncludedInAll(): boolean {
    return false;
  }

  isAvailable(_root: CliProgram, _paths: InstallPaths): boolean {
    return true;
  }

  isDetected(_paths: InstallPaths, root: CliProgram): boolean {
    return isExternallyManagedBinary(root.key) || false;
  }

  applyDetected(_paths: InstallPaths, root: CliProgram, out: InstalledArtifacts): void {
    out.app = isExternallyManagedBinary(root.key);
  }

  protected isDetectedFromSnapshot(detected: DetectedSnapshot): boolean {
    return detected.app;
  }

  protected formatStatusLine(_paths: InstallPaths, root: CliProgram): string {
    if (isExternallyManagedBinary(root.key)) {
      return "system (PATH)";
    }
    return "not installed (use Homebrew)";
  }

  protected assignStatusLine(status: InstallStatus, line: string): void {
    status.app = line;
  }

  protected buildInstallActions(_ctx: TargetPlanContext): InstallAction[] {
    return [];
  }

  protected buildUninstallActions(_ctx: TargetPlanContext): UninstallAction[] {
    return [];
  }
}

export const appTarget = new AppInstallTarget();
