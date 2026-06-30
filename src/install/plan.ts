import { resolveCapabilities } from "../capabilities.ts";
import type { CliProgram } from "../types.ts";
import type { InstallPaths } from "./paths.ts";
import { buildInstallPlanFromTargets } from "./target-plan-build.ts";
import type { InstallAction, InstallOpts } from "./target-types.ts";

export type { InstallAction, InstallActionKind, InstallOpts } from "./target-types.ts";

/** Builds install actions for normal mode (--all / scoped targets). */
export function buildInstallPlan(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
): InstallAction[] {
  return buildInstallPlanFromTargets(root, paths, opts);
}

/** Builds update/reinstall actions for detected artifacts within effective targets. */
export function buildUpdatePlan(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
): InstallAction[] {
  return buildInstallPlan(root, paths, { ...opts, reinstall: true, all: true });
}

/** @deprecated Use resolveInstallPlanMode + shouldIncludeArtifact. */
export function wantsInstallApp(opts: InstallOpts): boolean {
  return !!(opts.all || opts.app || opts.reinstall);
}

/** @deprecated Use {@link wantsInstallApp}. */
export const wantsInstallBin = wantsInstallApp;

/** @deprecated Use resolveInstallPlanMode + shouldIncludeArtifact. */
export function wantsInstallCompletions(opts: InstallOpts): boolean {
  return !!(opts.all || opts.completions);
}

/** @deprecated Use resolveInstallPlanMode + shouldIncludeArtifact. */
export function wantsInstallSkill(opts: InstallOpts): boolean {
  return !!(opts.all || opts.skill);
}

/** @deprecated Use resolveInstallPlanMode + shouldIncludeArtifact. */
export function wantsInstallMcp(opts: InstallOpts, root: CliProgram): boolean {
  return !!(opts.mcp || opts.all) && resolveCapabilities(root).mcp;
}

/** @deprecated Use configure target + shouldIncludeArtifact. */
export function wantsUninstallConfig(opts: InstallOpts, root: CliProgram): boolean {
  return !!(opts.configure || opts.all) && root.appConfig !== undefined;
}
