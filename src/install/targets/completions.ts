import { existsSync } from "node:fs";
import type { CliProgram } from "../../types.ts";
import { installCompletions, uninstallCompletions } from "../completions.ts";
import { displayInstallPath, type InstallPaths } from "../paths.ts";
import { detectShells } from "../shell.ts";
import { InstallTarget } from "../target-base.ts";
import type {
  DetectedSnapshot,
  InstallAction,
  InstalledArtifacts,
  InstallStatus,
  TargetPlanContext,
  UninstallAction,
} from "../target-types.ts";

type ShellKind = "bash" | "zsh" | "fish";

interface ShellCompletionSpec {
  shell: ShellKind;
  label: string;
  path: (paths: InstallPaths) => string;
  detectedKey: "bashCompletion" | "zshCompletion" | "fishCompletion";
}

const SHELLS: ShellCompletionSpec[] = [
  {
    shell: "bash",
    label: "bash completion",
    path: (p) => p.bashCompletion,
    detectedKey: "bashCompletion",
  },
  {
    shell: "zsh",
    label: "zsh completion",
    path: (p) => p.zshCompletion,
    detectedKey: "zshCompletion",
  },
  {
    shell: "fish",
    label: "fish completion",
    path: (p) => p.fishCompletion,
    detectedKey: "fishCompletion",
  },
];

/** Shell tab-completion scripts (bash / zsh / fish). */
class CompletionsInstallTarget extends InstallTarget {
  readonly key = "completions" as const;
  readonly actionKind = "completions" as const;
  readonly category = "core" as const;

  isAvailable(_root: CliProgram, _paths: InstallPaths): boolean {
    return true;
  }

  isDetected(paths: InstallPaths, _root: CliProgram): boolean {
    return SHELLS.some((s) => existsSync(s.path(paths)));
  }

  applyDetected(paths: InstallPaths, _root: CliProgram, out: InstalledArtifacts): void {
    for (const s of SHELLS) {
      out[s.detectedKey] = existsSync(s.path(paths));
    }
  }

  protected isDetectedFromSnapshot(detected: DetectedSnapshot): boolean {
    return detected.bashCompletion || detected.zshCompletion || detected.fishCompletion;
  }

  protected formatStatusLine(_paths: InstallPaths, _root: CliProgram): string {
    return "";
  }

  protected assignStatusLine(_status: InstallStatus, _line: string): void {}

  contributeStatus(
    paths: InstallPaths,
    _root: CliProgram,
    detected: InstalledArtifacts,
    status: InstallStatus,
  ): void {
    if (detected.bashCompletion) {
      status.bashCompletion = displayInstallPath(paths.bashCompletion);
    }
    if (detected.zshCompletion) {
      status.zshCompletion = displayInstallPath(paths.zshCompletion);
    }
    if (detected.fishCompletion) {
      status.fishCompletion = displayInstallPath(paths.fishCompletion);
    }
  }

  protected buildInstallActions(ctx: TargetPlanContext): InstallAction[] {
    const shells = detectShells();
    const actions: InstallAction[] = [];
    const refresh = ctx.mode === "refresh";

    for (const s of SHELLS) {
      const onPath = shells[s.shell];
      const path = s.path(ctx.paths);
      const wasInstalled = ctx.detected[s.detectedKey];
      if (!onPath || (refresh && !wasInstalled)) continue;

      actions.push({
        kind: "completions",
        summary: `${s.label}: ${displayInstallPath(path)}`,
        message: `Writing ${s.label} to ${displayInstallPath(path)}`,
        run: () => {
          const all = installCompletions(ctx.root, ctx.paths, ctx.dry);
          return all.filter((p) => p === path);
        },
      });
    }
    return actions;
  }

  protected buildUninstallActions(ctx: TargetPlanContext): UninstallAction[] {
    const actions: UninstallAction[] = [];
    for (const s of SHELLS) {
      if (!ctx.detected[s.detectedKey]) continue;
      const path = s.path(ctx.paths);
      actions.push({
        kind: "completions",
        summary: `${s.label}: ${displayInstallPath(path)}`,
        message: `Removing ${s.label} ${displayInstallPath(path)}`,
        run: () => uninstallCompletions(ctx.paths, ctx.dry).filter((p) => p === path),
      });
    }
    return actions;
  }
}

export const completionsTarget = new CompletionsInstallTarget();
