/*
Interactive and automated `configure` command orchestration (agent artifacts and app config).
*/

import { displayAppConfigPath, runConfigure } from "../config/bootstrap.ts";
import { ensureAppConfigFile } from "../config/file.ts";
import type { CliProgram, ConfigureHookContext } from "../core/types.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";
import { cliSkillInstall, isAgentSkillActionKind } from "../skill/install.ts";
import { displayInstallPath, type InstallPaths, resolveInstallPaths } from "./artifacts/paths.ts";
import { buildInstallPlan, buildUpdatePlan } from "./artifacts/plan.ts";
import {
  installErr,
  installInfo,
  installOut,
  printInstallStatus,
  writeInteractiveInstallIntro,
} from "./artifacts/status.ts";
import { resolveEffectiveInstallTargets } from "./artifacts/target-effective.ts";
import { runTargetPreflight } from "./artifacts/target-plan-build.ts";
import { INSTALL_TARGETS, installTargetForKey } from "./artifacts/target-registry.ts";
import { buildDetectedSnapshot, buildTargetPlanContext } from "./artifacts/target-scope.ts";
import type {
  CliInstallArtifactKey,
  InstallAction,
  InstallOpts,
  TargetPlanContext,
  UninstallAction,
} from "./artifacts/target-types.ts";
import { buildUninstallPlan, skillDirFromUninstallSummary, uninstallSkillDir } from "./artifacts/uninstall.ts";
import { artifactPromptLabel, promptTargetAction } from "./prompt.ts";

/** True when interactive `configure` should auto-run the app config wizard. */
export function appConfigHasEntries(program: CliProgram): boolean {
  const entries = program.appConfig?.entries;
  return !!entries && Object.keys(entries).length > 0;
}

/** Parsed flags for the top-level `configure` built-in. */
export interface ConfigureOpts {
  refresh?: boolean;
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
    refresh: flag("refresh"),
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
  const flags = [opts.refresh, opts.removeAll, opts.removeConfig, opts.status].filter(Boolean);
  if (flags.length > 1) {
    return "Use only one of --refresh, --remove-all, --remove-config, or --status.";
  }
  if (opts.json) {
    opts.yes = true;
  }
  if ((opts.refresh || opts.removeAll || opts.removeConfig) && !opts.yes) {
    return "--yes is required with --refresh, --remove-all, or --remove-config.";
  }
  return null;
}

/** Adapts configure flags to internal install-plan option shape. */
function configureToInstallOpts(opts: ConfigureOpts): InstallOpts {
  if (opts.status) {
    return { status: true, yes: opts.yes, dry: opts.dry, json: opts.json };
  }
  if (opts.refresh) {
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

/** Installs the agent skill bundle and returns changed paths. */
function runSkillAction(root: CliProgram, opts: InstallOpts): string[] {
  return cliSkillInstall(root, {
    global: true,
    rimraf: true,
    dry: opts.dry,
  });
}

/** Tallies configure mutations for the closing summary and `--json` output. */
export interface ConfigureMutationSummary {
  paths: string[];
  installed: number;
  removed: number;
  configured: number;
}

function emptyMutationSummary(): ConfigureMutationSummary {
  return { paths: [], installed: 0, removed: 0, configured: 0 };
}

function mergeMutationSummary(into: ConfigureMutationSummary, from: ConfigureMutationSummary): void {
  into.paths.push(...from.paths);
  into.installed += from.installed;
  into.removed += from.removed;
  into.configured += from.configured;
}

function recordArtifactMutation(
  summary: ConfigureMutationSummary,
  paths: string[],
  kind: "installed" | "removed" | "configured",
): void {
  if (paths.length === 0) return;
  summary.paths.push(...paths);
  summary[kind]++;
}

/** Human-readable closing line for configure mutations. */
export function formatConfigureMutationSummary(summary: ConfigureMutationSummary, opts: ConfigureOpts): string | null {
  if (summary.paths.length === 0) return null;

  if (opts.removeAll || opts.removeConfig) {
    const n = summary.removed;
    if (n === 0) return null;
    return n === 1 ? "Removed 1 artifact." : `Removed ${n} artifacts.`;
  }

  if (opts.refresh) {
    const n = summary.installed;
    if (n === 0) return null;
    return n === 1 ? "Refreshed 1 artifact." : `Refreshed ${n} artifacts.`;
  }

  const parts: string[] = [];
  if (summary.removed > 0) {
    parts.push(summary.removed === 1 ? "Removed 1 artifact" : `Removed ${summary.removed} artifacts`);
  }
  if (summary.installed > 0) {
    parts.push(summary.installed === 1 ? "Installed 1 artifact" : `Installed ${summary.installed} artifacts`);
  }
  if (summary.configured > 0) {
    parts.push("Updated app config");
  }
  if (parts.length === 0) return null;
  return `${parts.join("; ")}.`;
}

/** Runs one install/uninstall action and returns changed paths. */
function runPlanAction(
  root: CliProgram,
  action: InstallAction | UninstallAction,
  opts: InstallOpts,
  paths: ReturnType<typeof resolveInstallPaths>,
): string[] {
  if ("kind" in action && action.kind && isAgentSkillActionKind(action.kind)) {
    const runResult = action.run();
    if (runResult.length > 0) return runResult;
    if (opts.uninstall) {
      const skillDir = skillDirFromUninstallSummary(action.summary, paths);
      return skillDir ? uninstallSkillDir(skillDir, !!opts.dry) : [];
    }
    return runSkillAction(root, opts);
  }
  if (!("kind" in action) || !action.kind) {
    const skillDir = skillDirFromUninstallSummary(action.summary, paths);
    if (skillDir) return uninstallSkillDir(skillDir, !!opts.dry);
  }
  return action.run();
}

function configureHookContext(root: CliProgram, paths: InstallPaths, dry: boolean): ConfigureHookContext {
  return {
    program: root,
    dry,
    paths: {
      agentsSkillDir: paths.agentsSkillDir,
      agentsMcpPath: paths.agentsMcpPath,
      mcpName: paths.mcpName,
      skillDirName: paths.skillDirName,
    },
  };
}

async function runConfigureLifecycleHook(
  hook: ((ctx: ConfigureHookContext) => void | Promise<void>) | undefined,
  root: CliProgram,
  paths: InstallPaths,
  dry: boolean,
): Promise<void> {
  if (!hook) return;
  await hook(configureHookContext(root, paths, dry));
}

/** Runs install or uninstall actions and collects changed paths. */
function executePlan(
  root: CliProgram,
  actions: Array<InstallAction | UninstallAction>,
  opts: InstallOpts,
  showProgress: boolean,
): ConfigureMutationSummary {
  const summary = emptyMutationSummary();
  const paths = resolveInstallPaths(root);
  for (const action of actions) {
    if (showProgress) {
      installInfo(action.message, opts);
    }
    const changed = runPlanAction(root, action, opts, paths);
    if (changed.length === 0) continue;
    if (action.kind === "agent-skill" && !opts.uninstall && !opts.dry) {
      installOut(`Skill installed to ${displayInstallPath(paths.agentsSkillDir)}/`, opts);
    }
    if (action.kind === "agents-mcp" && !opts.uninstall && !opts.dry) {
      installOut(`MCP server registered in ${displayInstallPath(paths.agentsMcpPath)}`, opts);
    }
    if (action.kind === "configure") {
      recordArtifactMutation(summary, changed, opts.uninstall ? "removed" : "configured");
    } else {
      recordArtifactMutation(summary, changed, opts.uninstall ? "removed" : "installed");
    }
  }
  return summary;
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
async function runInteractiveConfigure(root: CliProgram, opts: ConfigureOpts): Promise<ConfigureMutationSummary> {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive configure requires a TTY. Use flags such as --refresh --yes.");
  }

  writeInteractiveInstallIntro(root);
  const paths = resolveInstallPaths(root);
  const detected = buildDetectedSnapshot(root, paths);
  const effective = resolveEffectiveInstallTargets(root.configure, root);
  const mutationOpts: InstallOpts = { dry: opts.dry, json: opts.json };
  const summary = emptyMutationSummary();

  for (const target of INSTALL_TARGETS) {
    if (target.key === "app" || target.key === "skill" || target.key === "agentsMcp") continue;
    if (!effective[target.key].enabled) continue;
    if (target.key !== "configure" && !target.isAvailable(root, paths)) continue;
    if (target.key === "configure" && !root.appConfig) continue;

    if (target.key === "configure") {
      if (!appConfigHasEntries(root)) continue;

      const result = runConfigure(root, { context: "standalone", showHeading: false, rePromptAll: true });
      if (result.changed) {
        installOut(`Wrote config: ${displayAppConfigPath(root)}`, mutationOpts);
        recordArtifactMutation(summary, [displayAppConfigPath(root)], "configured");
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

    mergeMutationSummary(
      summary,
      executePlan(root, actions, { ...mutationOpts, uninstall: choice === "uninstall" }, true),
    );
  }

  return summary;
}

/** Runs sync, remove, or status modes without per-target prompts. */
async function runAutomatedConfigure(root: CliProgram, opts: ConfigureOpts): Promise<ConfigureMutationSummary> {
  const installOpts = configureToInstallOpts(opts);
  const paths = resolveInstallPaths(root);

  if (installOpts.status) {
    printInstallStatus(root, installOpts);
    return emptyMutationSummary();
  }

  const summary = emptyMutationSummary();

  if (opts.removeAll) {
    await runConfigureLifecycleHook(root.configure?.beforeRemoveAll, root, paths, !!installOpts.dry);
  }

  if (installOpts.reinstall && !installOpts.uninstall) {
    const bootstrapped = ensureAppConfigFile(root, !!installOpts.dry);
    if (bootstrapped) {
      const display = displayAppConfigPath(root);
      recordArtifactMutation(summary, [display], "configured");
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

  mergeMutationSummary(summary, executePlan(root, actions, installOpts, true));

  if (opts.refresh) {
    await runConfigureLifecycleHook(root.configure?.afterRefresh, root, paths, !!installOpts.dry);
  }

  return summary;
}

/** Main configure command orchestrator. */
export async function cliConfigure(root: CliProgram, rawOpts: Record<string, string>): Promise<never> {
  const opts = parseConfigureOpts(rawOpts);
  const err = validateConfigureOpts(opts);
  if (err) {
    installErr(err);
    process.exit(1);
  }

  const isInteractive = !opts.refresh && !opts.removeAll && !opts.removeConfig && !opts.status;

  let summary = emptyMutationSummary();
  try {
    summary = isInteractive ? await runInteractiveConfigure(root, opts) : await runAutomatedConfigure(root, opts);
  } catch (mutationErr) {
    installErr(mutationErr instanceof Error ? mutationErr.message : String(mutationErr));
    process.exit(1);
  }

  if (opts.json && !opts.status) {
    process.stdout.write(`${JSON.stringify(summary.paths, null, 2)}\n`);
    process.exit(0);
  }

  const closing = formatConfigureMutationSummary(summary, opts);
  if (!opts.status && closing) {
    installOut(closing, configureToInstallOpts(opts));
  }

  process.exit(0);
}
