/*
`configure install` / `configure uninstall` / `configure status` orchestration.
*/

import { bootstrapAppConfig, displayAppConfigPath, runConfigure } from "../config/bootstrap.ts";
import { ensureAppConfigFile } from "../config/file.ts";
import { formatMissingConfigMessage, missingRequiredConfig } from "../config/resolve.ts";
import type { CliProgram, ConfigureHookContext } from "../core/types.ts";
import { readPromptLine } from "../prompt.ts";
import { type InstallPaths, resolveInstallPaths } from "./artifacts/paths.ts";
import { buildUpdatePlan } from "./artifacts/plan.ts";
import { installErr, printInstallStatus } from "./artifacts/status.ts";
import type { InstallAction, InstallOpts, UninstallAction } from "./artifacts/target-types.ts";
import { buildUninstallPlan } from "./artifacts/uninstall.ts";

/** True when `program.appConfig` has wizard entries. */
export function appConfigHasEntries(program: CliProgram): boolean {
  const entries = program.appConfig?.entries;
  return !!entries && Object.keys(entries).length > 0;
}

function configureHookContext(root: CliProgram, paths: InstallPaths): ConfigureHookContext {
  return {
    program: root,
    dry: false,
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
): Promise<void> {
  if (!hook) return;
  await hook(configureHookContext(root, paths));
}

function executePlan(actions: Array<InstallAction | UninstallAction>): void {
  for (const action of actions) {
    action.run();
  }
}

function runInstallWizard(root: CliProgram): void {
  if (!appConfigHasEntries(root)) return;

  const { resolved } = bootstrapAppConfig(root, { validateFile: false });
  const missing = missingRequiredConfig(root, resolved);

  if (process.stdin.isTTY) {
    if (missing.length === 0) return;
    runConfigure(root, { context: "after-install", showHeading: true, rePromptAll: false });
    return;
  }

  if (missing.length > 0) {
    installErr(formatMissingConfigMessage(root, missing));
    process.exit(1);
  }
}

function confirmUninstall(root: CliProgram, yes: boolean): void {
  if (yes || !process.stdin.isTTY) return;
  process.stderr.write(`Remove agent artifacts for ${root.key}? [y/N]: `);
  const ans = readPromptLine().trim().toLowerCase();
  if (ans !== "y" && ans !== "yes") {
    process.exit(0);
  }
}

/** Installs agent artifacts, bootstraps config, and runs the required-config wizard when needed. */
export async function cliConfigureInstall(root: CliProgram): Promise<never> {
  const paths = resolveInstallPaths(root);
  const installOpts: InstallOpts = { reinstall: true, all: true };

  try {
    const bootstrapped = ensureAppConfigFile(root, false);
    if (bootstrapped) {
      process.stdout.write(`Initialized config: ${displayAppConfigPath(root)}\n`);
    }

    const actions = buildUpdatePlan(root, paths, installOpts);
    executePlan(actions);
    runInstallWizard(root);
    await runConfigureLifecycleHook(root.configure?.afterInstall, root, paths);
  } catch (err) {
    installErr(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  process.exit(0);
}

/** Removes agent artifacts and app config. */
export async function cliConfigureUninstall(root: CliProgram, opts: { yes?: boolean }): Promise<never> {
  const paths = resolveInstallPaths(root);
  const uninstallOpts: InstallOpts = { uninstall: true, all: true };

  confirmUninstall(root, !!opts.yes);

  try {
    await runConfigureLifecycleHook(root.configure?.beforeUninstall, root, paths);
    const actions = buildUninstallPlan(root, paths, uninstallOpts);
    executePlan(actions);
  } catch (err) {
    installErr(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  process.exit(0);
}

/** Prints install status (human or JSON). */
export function cliConfigureStatus(root: CliProgram, opts: { json?: boolean }): never {
  printInstallStatus(root, { status: true, json: opts.json });
  process.exit(0);
}
