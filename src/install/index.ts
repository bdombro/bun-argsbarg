import { readSync } from "node:fs";
import { resolveCapabilities } from "../capabilities.ts";
import { CliProgram } from "../types.ts";
import { cliSkillInstall } from "../skill/install.ts";
import { checkMcpConflict, expectedMcpEntry } from "./mcp-config.ts";
import { checkCodexMcpConflict } from "./mcp-codex.ts";
import { checkOpenCodeMcpConflict, expectedOpenCodeMcpEntry } from "./mcp-opencode.ts";
import {
  buildInstallPlan,
  buildUpdatePlan,
  type InstallAction,
  type InstallOpts,
} from "./plan.ts";
import { resolveInstallPaths, userHome } from "./paths.ts";
import { installErr, installInfo, installOut, printInstallStatus } from "./status.ts";
import { buildUninstallPlan, uninstallSkillDir, type UninstallAction } from "./uninstall.ts";
import { cliUpdate } from "./update.ts";

export function parseInstallOpts(raw: Record<string, string>): InstallOpts {
  const flag = (name: string) => raw[name] === "1";
  return {
    all: flag("all"),
    bin: flag("bin"),
    completions: flag("completions"),
    skill: flag("skill"),
    mcp: flag("mcp"),
    reinstall: flag("reinstall"),
    update: flag("update"),
    from: raw.from,
    status: flag("status"),
    uninstall: flag("uninstall"),
    yes: flag("yes"),
    dry: flag("dry"),
    json: flag("json"),
    quiet: flag("quiet"),
    prefix: raw.prefix,
  };
}

export function validateInstallOpts(opts: InstallOpts): string | null {
  if (opts.quiet && opts.dry) {
    return "--quiet cannot be combined with --dry.";
  }
  if (opts.quiet && !opts.yes && !opts.json && !opts.reinstall && !opts.update) {
    return "--quiet requires --yes (or --json / --reinstall / --update).";
  }
  if (opts.json) {
    opts.yes = true;
  }
  if (opts.reinstall) {
    opts.bin = true;
    opts.yes = true;
  }
  if (opts.update) {
    opts.yes = true;
  }

  const mutationFlags =
    opts.all || opts.bin || opts.completions || opts.skill || opts.mcp || opts.reinstall || opts.update || opts.uninstall;
  if (opts.status && mutationFlags) {
    return "--status is mutually exclusive with install/reinstall/uninstall targets.";
  }
  if (
    opts.reinstall &&
    (opts.all || opts.completions || opts.skill || opts.mcp || opts.uninstall || opts.status || opts.update)
  ) {
    return "--reinstall cannot be combined with other target flags.";
  }
  if (
    opts.update &&
    (opts.all || opts.bin || opts.completions || opts.skill || opts.mcp || opts.uninstall || opts.status || opts.reinstall)
  ) {
    return "--update cannot be combined with other target flags.";
  }
  if (opts.uninstall && (opts.reinstall || opts.update || opts.status)) {
    return "--uninstall cannot be combined with --reinstall, --update, or --status.";
  }
  if (!opts.status && !opts.reinstall && !opts.update) {
    const hasTarget = opts.all || opts.bin || opts.completions || opts.skill || opts.mcp;
    if (!hasTarget) {
      return "Specify at least one target: --all, --bin, --completions, --skill, or --mcp.";
    }
  }
  return null;
}

function promptConfirm(): boolean {
  process.stderr.write("Continue? [y/N] ");
  const buf = Buffer.alloc(256);
  const n = readSync(0, buf, { length: 256 });
  const ans = buf.toString("utf8", 0, n).trim();
  return ans === "y" || ans === "Y";
}

function runSkillAction(
  root: CliProgram,
  kind: "cursor-skill" | "claude-skill",
  opts: InstallOpts,
): string[] {
  const target = kind === "cursor-skill" ? "cursor" : "claude";
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
): string[] {
  const changed: string[] = [];
  for (const action of actions) {
    installInfo(action.message, opts);
    if ("kind" in action && (action.kind === "cursor-skill" || action.kind === "claude-skill")) {
      changed.push(...runSkillAction(root, action.kind, opts));
      continue;
    }
    if (!("kind" in action) && action.summary.startsWith("cursor skill")) {
      const paths = resolveInstallPaths(root, opts);
      changed.push(...uninstallSkillDir(paths.cursorSkillDir, !!opts.dry));
      continue;
    }
    if (!("kind" in action) && action.summary.startsWith("claude skill")) {
      const paths = resolveInstallPaths(root, opts);
      changed.push(...uninstallSkillDir(paths.claudeSkillDir, !!opts.dry));
      continue;
    }
    changed.push(...action.run());
  }
  return changed;
}

/** Runs install/reinstall/uninstall mutations without exiting the process. */
export async function runInstallMutation(
  root: CliProgram,
  rawOpts: Record<string, string>,
): Promise<{ changed: string[]; opts: InstallOpts; paths: ReturnType<typeof resolveInstallPaths> }> {
  const opts = parseInstallOpts(rawOpts);
  const err = validateInstallOpts(opts);
  if (err) {
    throw new Error(err);
  }

  const paths = resolveInstallPaths(root, opts);

  if (opts.status) {
    printInstallStatus(root, opts);
    return { changed: [], opts, paths };
  }

  if (!opts.uninstall && resolveCapabilities(root).mcp && (opts.all || opts.mcp)) {
    const entry = expectedMcpEntry(root);
    const openCodeEntry = expectedOpenCodeMcpEntry(root);
    const yes = !!opts.yes;
    for (const p of [
      paths.cursorMcpPath,
      paths.claudeMcpPath,
      paths.claudeDesktopMcpPath,
      paths.chatGptMcpPath,
    ]) {
      const conflict = checkMcpConflict(p, paths.mcpName, entry, yes);
      if (conflict) {
        throw new Error(conflict);
      }
    }
    const openCodeConflict = checkOpenCodeMcpConflict(paths.opencodeMcpPath, paths.mcpName, openCodeEntry, yes);
    if (openCodeConflict) {
      throw new Error(openCodeConflict);
    }
    const codexConflict = checkCodexMcpConflict(userHome(), paths.mcpName, entry, yes);
    if (codexConflict) {
      throw new Error(codexConflict);
    }
  }

  let actions: Array<InstallAction | UninstallAction>;
  if (opts.uninstall) {
    actions = buildUninstallPlan(root, paths, opts);
  } else if (opts.reinstall) {
    actions = buildUpdatePlan(root, paths, opts);
  } else {
    actions = buildInstallPlan(root, paths, opts);
  }

  if (actions.length === 0) {
    return { changed: [], opts, paths };
  }

  if (!opts.quiet && !opts.json) {
    installOut("About to " + (opts.uninstall ? "remove" : opts.reinstall ? "reinstall" : "install") + ":", opts);
    for (const a of actions) {
      installOut("  - " + a.summary, opts);
    }
  }

  const autoYes = opts.yes || opts.json || opts.reinstall;
  if (!autoYes) {
    if (!process.stdin.isTTY) {
      throw new Error("Refusing to proceed without --yes (stdin is not a TTY).");
    }
    if (!promptConfirm()) {
      throw new Error("Aborted.");
    }
  }

  const changed = executePlan(root, actions, opts);
  return { changed, opts, paths };
}

/** Main install command orchestrator. */
export async function cliInstall(root: CliProgram, rawOpts: Record<string, string>): Promise<never> {
  const opts = parseInstallOpts(rawOpts);
  const err = validateInstallOpts(opts);
  if (err) {
    installErr(err);
    process.exit(1);
  }

  if (opts.update) {
    if (!resolveCapabilities(root).update) {
      installErr("install --update requires install.updateGetLatest on the program root.");
      process.exit(1);
    }
    await cliUpdate(root);
  }

  let result: Awaited<ReturnType<typeof runInstallMutation>>;
  try {
    result = await runInstallMutation(root, rawOpts);
  } catch (err) {
    installErr(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { changed, opts: mutationOpts, paths } = result;

  if (mutationOpts.status) {
    process.exit(0);
  }

  if (mutationOpts.json) {
    process.stdout.write(JSON.stringify(changed, null, 2) + "\n");
    process.exit(0);
  }

  if (!mutationOpts.quiet && changed.length > 0) {
    const verb = mutationOpts.uninstall ? "Removed" : mutationOpts.reinstall ? "Reinstalled" : "Installed";
    installOut(`${verb} ${changed.length} file(s).`, mutationOpts);
    if (
      !mutationOpts.uninstall &&
      (mutationOpts.all || mutationOpts.bin) &&
      changed.some((p) => p === paths.bashRc || p === paths.zshRc || p === paths.binaryPath)
    ) {
      installOut("Open a new shell, or run: hash -r (bash) / rehash (zsh)", mutationOpts);
    }
  }

  process.exit(0);
}
