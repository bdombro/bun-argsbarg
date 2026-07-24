import type { CliProgram } from "~/core/types.ts";
import type { InstallPaths } from "./paths.ts";
import { buildInstallPlanFromTargets } from "./target-plan-build.ts";
import type { InstallAction, InstallOpts } from "./target-types.ts";

export type { InstallAction, InstallActionKind, InstallOpts } from "./target-types.ts";

/** Builds install actions for normal mode (--all / scoped targets). */
export function buildInstallPlan(root: CliProgram, paths: InstallPaths, opts: InstallOpts): InstallAction[] {
  return buildInstallPlanFromTargets(root, paths, opts);
}

/** Builds update/reinstall actions; greenfield fallback when nothing detected. */
export function buildUpdatePlan(root: CliProgram, paths: InstallPaths, opts: InstallOpts): InstallAction[] {
  const refresh = buildInstallPlanFromTargets(root, paths, {
    ...opts,
    reinstall: true,
    all: true,
  });
  if (refresh.length > 0) {
    return refresh;
  }
  return buildInstallPlanFromTargets(root, paths, { ...opts, reinstall: false, all: true });
}
