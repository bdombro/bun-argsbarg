import { readSync } from "node:fs";
import { resolveCapabilities } from "../capabilities.ts";
import { displayAppConfigPath, runInstallConfigure } from "../config/bootstrap.ts";
import { cliSkillInstall, skillTargetFromActionKind } from "../skill/install.ts";
import type { CliProgram } from "../types.ts";
import { normalizeInstallRawOpts } from "./normalize.ts";
import { resolveInstallPaths } from "./paths.ts";
import { buildInstallPlan, buildUpdatePlan, type InstallAction, type InstallOpts } from "./plan.ts";
import {
  installErr,
  installInfo,
  installOut,
  printInstallStatus,
  writeInteractiveInstallIntro,
} from "./status.ts";
import { resolveEffectiveInstallTargets } from "./target-effective.ts";
import { runTargetPreflight } from "./target-plan-build.ts";
import type { InstallActionKind } from "./target-types.ts";
import {
  buildUninstallPlan,
  skillDirFromUninstallSummary,
  type UninstallAction,
  uninstallSkillDir,
} from "./uninstall.ts";
import { cliUpdate } from "./update.ts";

export function parseInstallOpts(raw: Record<string, string>): InstallOpts {
  const flag = (name: string) => raw[name] === "1";
  return {
    all: flag("all"),
    app: flag("app"),
    completions: flag("completions"),
    skill: flag("skill"),
    mcp: flag("mcp"),
    reinstall: flag("reinstall"),
    update: flag("update"),
    from: raw.from,
    status: flag("status"),
    uninstall: flag("uninstall"),
    configure: flag("configure"),
    yes: flag("yes"),
    dry: flag("dry"),
    json: flag("json"),
  };
}

export function validateInstallOpts(opts: InstallOpts): string | null {
  const configureOnlyInstall =
    opts.configure &&
    !opts.uninstall &&
    !opts.all &&
    !opts.app &&
    !opts.completions &&
    !opts.skill &&
    !opts.mcp &&
    !opts.reinstall &&
    !opts.update &&
    !opts.status;

  if (configureOnlyInstall) {
    return null;
  }

  if (opts.json) {
    opts.yes = true;
  }
  if (opts.reinstall) {
    opts.yes = true;
  }
  if (opts.update) {
    opts.yes = true;
  }

  const mutationFlags =
    opts.all ||
    opts.app ||
    opts.completions ||
    opts.skill ||
    opts.mcp ||
    opts.reinstall ||
    opts.update ||
    opts.uninstall ||
    opts.configure;
  if (opts.status && mutationFlags) {
    return "--status is mutually exclusive with install/reinstall/uninstall targets.";
  }
  if (
    opts.reinstall &&
    (opts.all ||
      opts.completions ||
      opts.skill ||
      opts.mcp ||
      opts.uninstall ||
      opts.status ||
      opts.update ||
      opts.configure)
  ) {
    return "--reinstall cannot be combined with other target flags.";
  }
  if (
    opts.update &&
    (opts.all ||
      opts.app ||
      opts.completions ||
      opts.skill ||
      opts.mcp ||
      opts.uninstall ||
      opts.status ||
      opts.reinstall ||
      opts.configure)
  ) {
    return "--update cannot be combined with other target flags.";
  }
  if (opts.uninstall && (opts.reinstall || opts.update || opts.status)) {
    return "--uninstall cannot be combined with --reinstall, --update, or --status.";
  }
  if (opts.uninstall) {
    const hasUninstallTarget =
      opts.all || opts.app || opts.completions || opts.skill || opts.mcp || opts.configure;
    if (!hasUninstallTarget) {
      return "Specify at least one target: --all, --app, --completions, --skill, --mcp, or --configure.";
    }
  }
  if (!opts.status && !opts.reinstall && !opts.update && !opts.uninstall) {
    const hasTarget =
      opts.all || opts.app || opts.completions || opts.skill || opts.mcp || opts.configure;
    if (!hasTarget) {
      return "Specify at least one target: --all, --app, --completions, --skill, --mcp, or --configure.";
    }
  }
  return null;
}

function parseSelectionIndices(input: string, max: number): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  const indices: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      return null;
    }
    if (!indices.includes(n)) {
      indices.push(n);
    }
  }
  return indices.sort((a, b) => a - b);
}

/** Interactive install: item 1 is the app when the plan leads with `app`. */
export function interactiveSelectionAssumesApp(
  actions: Array<InstallAction | UninstallAction>,
  uninstall: boolean,
): boolean {
  if (uninstall) return false;
  const first = actions[0];
  return first !== undefined && "kind" in first && first.kind === "app";
}

export function mergeInteractiveSelection(
  indices: number[],
  count: number,
  alwaysIncludeFirst: boolean,
): number[] {
  if (!alwaysIncludeFirst || count === 0 || indices.includes(1)) {
    return indices;
  }
  return [1, ...indices].sort((a, b) => a - b);
}

function promptSelectiveConfirm(count: number, alwaysIncludeFirst: boolean): number[] | null {
  const hint = alwaysIncludeFirst
    ? "Proceed [y/N], or numbers to include (e.g. 2,3): "
    : "Proceed [y/N], or numbers to include (e.g. 1,3): ";
  process.stderr.write(hint);
  const buf = Buffer.alloc(256);
  const n = readSync(0, buf, { length: 256 });
  const ans = buf.toString("utf8", 0, n).trim();
  if (ans === "y" || ans === "Y") {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  if (ans === "n" || ans === "N" || ans === "") {
    return null;
  }
  const parsed = parseSelectionIndices(ans, count);
  if (!parsed) return null;
  return mergeInteractiveSelection(parsed, count, alwaysIncludeFirst);
}

function runSkillAction(root: CliProgram, kind: InstallActionKind, opts: InstallOpts): string[] {
  const target = skillTargetFromActionKind(kind);
  if (!target) return [];
  return cliSkillInstall(root, target, {
    global: true,
    rimraf: true,
    dry: opts.dry,
  });
}

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

function shouldRunConfigureWizardAfterInstall(root: CliProgram, opts: InstallOpts): boolean {
  if (opts.uninstall || opts.reinstall || opts.update || opts.status || !root.appConfig) {
    return false;
  }
  if (!opts.all && !opts.app && !opts.completions && !opts.skill && !opts.mcp) {
    return false;
  }
  const effective = resolveEffectiveInstallTargets(root.install, root);
  return effective.configure.includedInAll && effective.configure.enabled;
}

/** Runs install/reinstall/uninstall mutations without exiting the process. */
export async function runInstallMutation(
  root: CliProgram,
  rawOpts: Record<string, string>,
): Promise<{
  changed: string[];
  opts: InstallOpts;
  paths: ReturnType<typeof resolveInstallPaths>;
}> {
  const normalized = normalizeInstallRawOpts(rawOpts);
  const opts = parseInstallOpts(normalized);
  const err = validateInstallOpts(opts);
  if (err) {
    throw new Error(err);
  }

  const paths = resolveInstallPaths(root);

  if (opts.status) {
    printInstallStatus(root, opts);
    return { changed: [], opts, paths };
  }

  let actions: Array<InstallAction | UninstallAction>;
  if (opts.uninstall) {
    actions = buildUninstallPlan(root, paths, opts);
  } else if (opts.reinstall) {
    actions = buildUpdatePlan(root, paths, opts);
  } else {
    actions = buildInstallPlan(root, paths, opts);
  }

  const installActions = actions.filter(
    (a): a is InstallAction => "kind" in a && typeof a.kind === "string" && a.kind.includes("-mcp"),
  );
  if (!opts.uninstall && resolveCapabilities(root).mcp && installActions.length > 0) {
    runTargetPreflight(root, paths, opts, installActions);
  }

  let selectedActions = actions;
  const autoYes = !!(opts.yes || opts.json || opts.reinstall || opts.update || opts.dry);

  if (!autoYes && !opts.json && process.stdin.isTTY) {
    writeInteractiveInstallIntro(root);
  }

  if (actions.length === 0) {
    return { changed: [], opts, paths };
  }

  if (!autoYes) {
    installOut(
      `About to ${opts.uninstall ? "remove" : opts.reinstall ? "reinstall" : "install"}:`,
      opts,
    );
    for (let i = 0; i < actions.length; i++) {
      installOut(`  ${i + 1}. ${actions[i]?.summary}`, opts);
    }
  }

  if (!autoYes) {
    if (!process.stdin.isTTY) {
      throw new Error("Refusing to proceed without --yes (stdin is not a TTY).");
    }
    const assumeApp = interactiveSelectionAssumesApp(actions, !!opts.uninstall);
    const selection = promptSelectiveConfirm(actions.length, assumeApp);
    if (!selection) {
      throw new Error("Aborted.");
    }
    process.stderr.write("Done.\n");
    selectedActions = selection.map((i) => actions[i - 1]).filter(Boolean) as typeof actions;
  }

  const changed = executePlan(root, selectedActions, opts, autoYes);
  return { changed, opts, paths };
}

/** Main install command orchestrator. */
export async function cliInstall(
  root: CliProgram,
  rawOpts: Record<string, string>,
): Promise<never> {
  const normalized = normalizeInstallRawOpts(rawOpts);
  const opts = parseInstallOpts(normalized);

  const configureOnly =
    opts.configure &&
    !opts.uninstall &&
    !opts.all &&
    !opts.app &&
    !opts.completions &&
    !opts.skill &&
    !opts.mcp;

  if (configureOnly) {
    if (!root.appConfig) {
      installErr("This app does not support --configure.");
      process.exit(1);
    }
    if (process.stdin.isTTY) {
      writeInteractiveInstallIntro(root);
    }
    const result = runInstallConfigure(root, { context: "standalone" });
    if (result.changed) {
      installOut(`Wrote config: ${displayAppConfigPath(root)}`, opts);
    } else {
      installOut(`Config unchanged: ${displayAppConfigPath(root)}`, opts);
    }
    process.exit(0);
  }

  const err = validateInstallOpts(opts);
  if (err) {
    installErr(err);
    process.exit(1);
  }

  if (opts.update) {
    if (!resolveCapabilities(root).update) {
      installErr("Remote updates are not supported by this app.");
      process.exit(1);
    }
    await cliUpdate(root);
  }

  let result: Awaited<ReturnType<typeof runInstallMutation>>;
  try {
    result = await runInstallMutation(root, normalized);
  } catch (err) {
    installErr(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { changed, opts: mutationOpts, paths } = result;

  if (mutationOpts.status) {
    process.exit(0);
  }

  if (
    shouldRunConfigureWizardAfterInstall(root, mutationOpts) &&
    !mutationOpts.uninstall &&
    !mutationOpts.dry
  ) {
    const configResult = runInstallConfigure(root, { context: "after-install" });
    if (configResult.changed) {
      installOut(`Wrote config: ${displayAppConfigPath(root)}`, mutationOpts);
    }
  }

  if (mutationOpts.json) {
    process.stdout.write(`${JSON.stringify(changed, null, 2)}\n`);
    process.exit(0);
  }

  if (changed.length > 0) {
    const verb = mutationOpts.uninstall
      ? "Removed"
      : mutationOpts.reinstall
        ? "Reinstalled"
        : "Installed";
    installOut(`${verb} ${changed.length} file(s).`, mutationOpts);
    if (
      !mutationOpts.uninstall &&
      (mutationOpts.all || mutationOpts.app) &&
      changed.some((p) => p === paths.bashRc || p === paths.zshRc || p === paths.appPath)
    ) {
      installOut("Open a new shell, or run: hash -r (bash) / rehash (zsh)", mutationOpts);
    }
  }

  process.exit(0);
}
