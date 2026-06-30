import { resolveCapabilities } from "../capabilities.ts";
import type { CliProgram } from "../types.ts";
import type { InstallPaths } from "./paths.ts";
import { mcpCategoryEnabled } from "./target-effective.ts";
import { INSTALL_TARGETS, installTargetForKey } from "./target-registry.ts";
import { buildDetectedSnapshot, buildTargetPlanContext } from "./target-scope.ts";
import type { InstallAction, InstallOpts, UninstallAction } from "./target-types.ts";

/** Builds install actions for normal mode (--all / scoped targets). */
export function buildInstallPlanFromTargets(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
): InstallAction[] {
  const detected = buildDetectedSnapshot(root, paths);
  const ctx = buildTargetPlanContext(root, paths, opts, detected);

  const actions: InstallAction[] = [];
  const mcpEnabled = mcpCategoryEnabled(root);

  for (const target of INSTALL_TARGETS) {
    if (target.category === "mcp" && !mcpEnabled) continue;
    actions.push(...target.planInstall(ctx));
  }
  return actions;
}

/** Builds uninstall actions for scoped targets or --all. */
export function buildUninstallPlanFromTargets(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
): UninstallAction[] {
  const detected = buildDetectedSnapshot(root, paths);
  const ctx = buildTargetPlanContext(root, paths, opts, detected);

  const actions: UninstallAction[] = [];
  for (const target of INSTALL_TARGETS) {
    if (target.key === "configure") continue;
    actions.push(...target.planUninstall(ctx));
  }
  const configure = installTargetForKey("configure");
  if (configure) {
    actions.push(...configure.planUninstall(ctx));
  }
  return actions;
}

/** Runs MCP preflight for planned install actions. */
export function runTargetPreflight(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
  actions: InstallAction[],
): void {
  if (!resolveCapabilities(root).mcp) return;

  const kinds = new Set(actions.map((a) => a.kind));
  const detected = buildDetectedSnapshot(root, paths);
  const ctx = buildTargetPlanContext(root, paths, opts, detected);

  for (const target of INSTALL_TARGETS) {
    if (!target.preflight || !kinds.has(target.actionKind)) continue;
    const err = target.preflight(ctx);
    if (err) throw new Error(err);
  }
}
