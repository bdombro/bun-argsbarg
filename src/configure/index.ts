/*
Interactive and automated `configure` command orchestration (agent artifacts and app config).
*/

import { resolveCapabilities } from "../capabilities.ts";
import { displayAppConfigPath, runConfigure } from "../config/bootstrap.ts";
import { ensureAppConfigFile } from "../config/file.ts";
import { resolveInstallPaths } from "../install/paths.ts";
import { buildInstallPlan, buildUpdatePlan } from "../install/plan.ts";
import {
  installErr,
  installInfo,
  installOut,
  printInstallStatus,
  writeInteractiveInstallIntro,
} from "../install/status.ts";
import { resolveEffectiveInstallTargets } from "../install/target-effective.ts";
import { runTargetPreflight } from "../install/target-plan-build.ts";
import { INSTALL_TARGETS, installTargetForKey } from "../install/target-registry.ts";
import { buildDetectedSnapshot, buildTargetPlanContext } from "../install/target-scope.ts";
import type {
  CliInstallArtifactKey,
  InstallAction,
  InstallActionKind,
  InstallOpts,
  TargetPlanContext,
  UninstallAction,
} from "../install/target-types.ts";
import { buildUninstallPlan, skillDirFromUninstallSummary, uninstallSkillDir } from "../install/uninstall.ts";
import { cliSkillInstall, skillTargetFromActionKind } from "../skill/install.ts";
import type { CliProgram } from "../types.ts";
import { artifactPromptLabel, promptTargetAction } from "./prompt.ts";

/** True when interactive `configure` should auto-run the app config wizard. */
export function appConfigHasEntries(program: CliProgram): boolean {
  const entries = program.appConfig?.entries;
  return !!entries && Object.keys(entries).length > 0;
}

/** Parsed flags for the top-level `configure` built-in. */
export interface ConfigureOpts {
  sync?: boolean;
  removeAll?: boolean;
  removeConfig?: boolean;
  status?: boolean;
  yes?: boolean;
  dry?: boolean;
  json?: boolean;
}

/** Maps raw argv flags into {@link ConfigureOpts}. */
export function parseConfigureOpts(raw: Record<string, string>): ConfigureOpts {
  const flag = (name: string) => raw[name] === "1";
  return {
    sync: flag("sync"),
    removeAll: flag("remove-all"),
    removeConfig: flag("remove-config"),
    status: flag("status"),
    yes: flag("yes"),
    dry: flag("dry"),
    json: flag("json"),
  };
}

/** Returns an error message when configure flags are inconsistent; otherwise null. */
export function validateConfigureOpts(opts: ConfigureOpts): string | null {
  const flags = [opts.sync, opts.removeAll, opts.removeConfig, opts.status].filter(Boolean);
  if (flags.length > 1) {
    return "Use only one of --sync, --remove-all, --remove-config, or --status.";
  }
  if (opts.json) {
    opts.yes = true;
  }
  if ((opts.sync || opts.removeAll || opts.removeConfig) && !opts.yes) {
    return "--yes is required with --sync, --remove-all, or --remove-config.";
  }
  return null;
}

/** Adapts configure flags to internal install-plan option shape. */
function configureToInstallOpts(opts: ConfigureOpts): InstallOpts {
  if (opts.status) {
    return { status: true, yes: opts.yes, dry: opts.dry, json: opts.json };
  }
  if (opts.sync) {
    return { reinstall: true, yes: true, dry: opts.dry, json: opts.json };
  }
  if (opts.removeAll) {
    return { uninstall: true, all: true, yes: true, dry: opts.dry, json: opts.json };
  }
  if (opts.removeConfig) {
    return { uninstall: true, configure: true, yes: true, dry: opts.dry, json: opts.json };
  }
  return { dry: opts.dry, json: opts.json };
}

/** Installs a skill target and returns changed paths. */
function runSkillAction(root: CliProgram, kind: InstallActionKind, opts: InstallOpts): string[] {
  const target = skillTargetFromActionKind(kind);
  if (!target) return [];
  return cliSkillInstall(root, target, {
    global: true,
    rimraf: true,
    dry: opts.dry,
  });
}

/** Runs install or uninstall actions and collects changed paths. */
function executePlan(
  root: CliProgram,
  actions: Array<InstallAction | UninstallAction>,
  opts: InstallOpts,
  showProgress: boolean,
): string[] {
  const changed: string[] = [];
  const paths = resolveInstallPaths(root);
  for (const action of actions) {
    if (showProgress) {
      installInfo(action.message, opts);
    }
    if ("kind" in action && action.kind) {
      const skillTarget = skillTargetFromActionKind(action.kind);
      if (skillTarget) {
        changed.push(...runSkillAction(root, action.kind as InstallActionKind, opts));
        continue;
      }
    }
    if (!("kind" in action) || !action.kind) {
      const skillDir = skillDirFromUninstallSummary(action.summary, paths);
      if (skillDir) {
        changed.push(...uninstallSkillDir(skillDir, !!opts.dry));
        continue;
      }
    }
    changed.push(...action.run());
  }
  return changed;
}

/** Builds plan context limited to a single artifact key. */
function buildSingleTargetContext(
  root: CliProgram,
  paths: ReturnType<typeof resolveInstallPaths>,
  detected: ReturnType<typeof buildDetectedSnapshot>,
  key: CliInstallArtifactKey,
  mode: "install" | "uninstall",
  opts: InstallOpts,
): TargetPlanContext {
  const effective = resolveEffectiveInstallTargets(root.configure, root);
  const base = buildTargetPlanContext(root, paths, opts, detected);
  return {
    ...base,
    mode: mode === "install" ? "install-scoped" : "uninstall-scoped",
    include: (k) => k === key && effective[k].enabled,
  };
}

/** Resolves install or uninstall actions for one artifact target. */
function actionsForTarget(
  root: CliProgram,
  paths: ReturnType<typeof resolveInstallPaths>,
  key: CliInstallArtifactKey,
  action: "install" | "uninstall",
  opts: InstallOpts,
): Array<InstallAction | UninstallAction> {
  const detected = buildDetectedSnapshot(root, paths);
  const target = installTargetForKey(key);
  if (!target) return [];
  const ctx = buildSingleTargetContext(root, paths, detected, key, action, opts);
  if (action === "install") {
    return target.planInstall(ctx);
  }
  return target.planUninstall(ctx);
}

/** Walks enabled targets with per-target prompts (TTY required). */
async function runInteractiveConfigure(root: CliProgram, opts: ConfigureOpts): Promise<string[]> {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive configure requires a TTY. Use flags such as --sync --yes.");
  }

  writeInteractiveInstallIntro(root);
  const paths = resolveInstallPaths(root);
  const detected = buildDetectedSnapshot(root, paths);
  const effective = resolveEffectiveInstallTargets(root.configure, root);
  const mutationOpts: InstallOpts = { dry: opts.dry, json: opts.json };
  const changed: string[] = [];

  for (const target of INSTALL_TARGETS) {
    if (target.key === "app") continue;
    if (!effective[target.key].enabled) continue;
    if (target.key !== "configure" && !target.isAvailable(root, paths)) continue;
    if (target.key === "configure" && !root.appConfig) continue;

    if (target.key === "configure") {
      if (!appConfigHasEntries(root)) continue;

      const result = runConfigure(root, { context: "standalone", showHeading: false });
      if (result.changed) {
        installOut(`Wrote config: ${displayAppConfigPath(root)}`, mutationOpts);
        changed.push(displayAppConfigPath(root));
      }
      continue;
    }

    const label = artifactPromptLabel(target.key);
    const installed = target.detectedForSnapshot(detected);

    const statusHint = installed ? "installed" : "not installed";
    process.stderr.write(`\n${label} (${statusHint})\n`);
    const choice = promptTargetAction(label, installed);
    if (!choice || choice === "skip") continue;

    const actions = actionsForTarget(root, paths, target.key, choice, mutationOpts);
    if (actions.length === 0) continue;

    const installActions = actions.filter(
      (a): a is InstallAction => "kind" in a && typeof a.kind === "string" && a.kind.includes("-mcp"),
    );
    if (choice === "install" && resolveCapabilities(root).mcp && installActions.length > 0) {
      runTargetPreflight(root, paths, mutationOpts, installActions);
    }

    changed.push(...executePlan(root, actions, mutationOpts, true));
  }

  return changed;
}

/** Runs sync, remove, or status modes without per-target prompts. */
async function runAutomatedConfigure(root: CliProgram, opts: ConfigureOpts): Promise<string[]> {
  const installOpts = configureToInstallOpts(opts);
  const paths = resolveInstallPaths(root);

  if (installOpts.status) {
    printInstallStatus(root, installOpts);
    return [];
  }

  const changed: string[] = [];

  if (installOpts.reinstall && !installOpts.uninstall) {
    const bootstrapped = ensureAppConfigFile(root, !!installOpts.dry);
    if (bootstrapped) {
      const display = displayAppConfigPath(root);
      changed.push(display);
      installOut(`Initialized config: ${display}`, installOpts);
    }
  }

  let actions: Array<InstallAction | UninstallAction>;
  if (installOpts.uninstall) {
    actions = buildUninstallPlan(root, paths, installOpts);
  } else if (installOpts.reinstall) {
    actions = buildUpdatePlan(root, paths, installOpts);
  } else {
    actions = buildInstallPlan(root, paths, installOpts);
  }

  const installActions = actions.filter(
    (a): a is InstallAction => "kind" in a && typeof a.kind === "string" && a.kind.includes("-mcp"),
  );
  if (!installOpts.uninstall && resolveCapabilities(root).mcp && installActions.length > 0) {
    runTargetPreflight(root, paths, installOpts, installActions);
  }

  return [...changed, ...executePlan(root, actions, installOpts, true)];
}

/** Main configure command orchestrator. */
export async function cliConfigure(root: CliProgram, rawOpts: Record<string, string>): Promise<never> {
  const opts = parseConfigureOpts(rawOpts);
  const err = validateConfigureOpts(opts);
  if (err) {
    installErr(err);
    process.exit(1);
  }

  const isInteractive = !opts.sync && !opts.removeAll && !opts.removeConfig && !opts.status;

  let changed: string[] = [];
  try {
    changed = isInteractive ? await runInteractiveConfigure(root, opts) : await runAutomatedConfigure(root, opts);
  } catch (mutationErr) {
    installErr(mutationErr instanceof Error ? mutationErr.message : String(mutationErr));
    process.exit(1);
  }

  if (opts.json && !opts.status) {
    process.stdout.write(`${JSON.stringify(changed, null, 2)}\n`);
    process.exit(0);
  }

  if (!opts.status && changed.length > 0) {
    const verb = opts.removeAll || opts.removeConfig ? "Removed" : opts.sync ? "Synced" : "Updated";
    installOut(`${verb} ${changed.length} file(s).`, configureToInstallOpts(opts));
  }

  process.exit(0);
}
