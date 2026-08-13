import { existsSync } from "node:fs";
import type { CliProgram } from "../../core/types.ts";
import { cliSkillInstall } from "../../skill/install.ts";
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
import { uninstallSkillDir } from "./uninstall.ts";

export interface SkillHostSpec {
  key: CliInstallArtifactKey;
  actionKind: InstallActionKind;
  label: string;
  uninstallPrefix: string;
  skillDir: (paths: InstallPaths) => string;
  detectedKey: "skill";
  statusField: "skill";
  isAvailable: (root: CliProgram, paths: InstallPaths) => boolean;
}

/** Agent shell skill directory install (`~/.agents/skills/<key>/`). */
export class SkillInstallTarget extends InstallTarget {
  readonly key: CliInstallArtifactKey;
  readonly actionKind: InstallActionKind;
  readonly category = "skill" as const;
  readonly uninstallPrefix: string;

  private readonly spec: SkillHostSpec;

  constructor(spec: SkillHostSpec) {
    super();
    this.spec = spec;
    this.key = spec.key;
    this.actionKind = spec.actionKind;
    this.uninstallPrefix = spec.uninstallPrefix;
  }

  isAvailable(root: CliProgram, paths: InstallPaths): boolean {
    return this.spec.isAvailable(root, paths);
  }

  isDetected(paths: InstallPaths, _root: CliProgram): boolean {
    return existsSync(this.spec.skillDir(paths));
  }

  applyDetected(paths: InstallPaths, root: CliProgram, out: InstalledArtifacts): void {
    out[this.spec.detectedKey] = this.isDetected(paths, root);
  }

  protected isDetectedFromSnapshot(detected: DetectedSnapshot): boolean {
    return detected[this.spec.detectedKey];
  }

  protected formatStatusLine(paths: InstallPaths, _root: CliProgram): string {
    return `${displayInstallPath(this.spec.skillDir(paths))}/`;
  }

  protected assignStatusLine(status: InstallStatus, line: string): void {
    status[this.spec.statusField] = line;
  }

  skillDir(paths: InstallPaths): string {
    return this.spec.skillDir(paths);
  }

  protected buildInstallActions(ctx: TargetPlanContext): InstallAction[] {
    const dir = this.spec.skillDir(ctx.paths);
    const displayDir = `${displayInstallPath(dir)}/`;
    return [
      {
        kind: this.actionKind,
        summary: `${this.spec.label.toLowerCase()}: ${displayDir}`,
        message: `Installing ${this.spec.label.toLowerCase()} to ${displayDir}`,
        run: () => {
          cliSkillInstall(ctx.root, { global: true, rimraf: true, dry: ctx.dry });
          return [];
        },
      },
    ];
  }

  protected buildUninstallActions(ctx: TargetPlanContext): UninstallAction[] {
    const dir = this.spec.skillDir(ctx.paths);
    return [
      {
        kind: this.actionKind,
        summary: `${this.uninstallPrefix}: ${displayInstallPath(dir)}/`,
        message: `Removing ${this.spec.label.toLowerCase()} ${displayInstallPath(dir)}/`,
        run: () => uninstallSkillDir(dir, ctx.dry),
      },
    ];
  }
}
