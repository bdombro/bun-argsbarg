import { existsSync, rmSync } from "node:fs";
import type { CliProgram } from "../types.ts";
import type { InstallPaths } from "./paths.ts";
import { buildUninstallPlanFromTargets } from "./target-plan-build.ts";
import { skillTargetForUninstallSummary } from "./target-registry.ts";
import type { InstallOpts, UninstallAction } from "./target-types.ts";

export type { InstallActionKind, InstallOpts, UninstallAction } from "./target-types.ts";

/** Builds uninstall actions for scoped targets or --all (ignores install.targets on --all). */
export function buildUninstallPlan(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
): UninstallAction[] {
  return buildUninstallPlanFromTargets(root, paths, opts);
}

/** Rimraf skill directories during uninstall. */
export function uninstallSkillDir(dir: string, dry: boolean): string[] {
  if (!existsSync(dir)) return [];
  if (!dry) rmSync(dir, { recursive: true, force: true });
  return [`${dir}/`];
}

/** Skill directory for uninstall action summary prefix. */
export function skillDirFromUninstallSummary(
  summary: string,
  paths: InstallPaths,
): string | undefined {
  const target = skillTargetForUninstallSummary(summary);
  return target?.skillDir(paths);
}
