import { readSync } from "node:fs";
import { resolveCapabilities } from "../capabilities.ts";
import { CliProgram } from "../types.ts";
import { cliSkillInstall } from "../skill/install.ts";
import { checkMcpConflict, expectedMcpEntry } from "./mcp-config.ts";
import {
  buildInstallPlan,
  buildUpdatePlan,
  type InstallAction,
  type InstallOpts,
} from "./plan.ts";
import { resolveInstallPaths } from "./paths.ts";
import { installErr, installInfo, installOut, printInstallStatus } from "./status.ts";
import { buildUninstallPlan, uninstallSkillDir, type UninstallAction } from "./uninstall.ts";

function parseInstallOpts(raw: Record<string, string>): InstallOpts {
  const flag = (name: string) => raw[name] === "1";
  return {
    all: flag("all"),
    bin: flag("bin"),
    completions: flag("completions"),
    skill: flag("skill"),
    mcp: flag("mcp"),
    update: flag("update"),
    status: flag("status"),
    uninstall: flag("uninstall"),
    yes: flag("yes"),
    dry: flag("dry"),
    json: flag("json"),
    quiet: flag("quiet"),
    prefix: raw.prefix,
  };
}

function validateOpts(opts: InstallOpts): string | null {
  if (opts.quiet && opts.dry) {
    return "--quiet cannot be combined with --dry.";
  }
  if (opts.quiet && !opts.yes && !opts.json && !opts.update) {
    return "--quiet requires --yes (or --json / --update).";
  }
  if (opts.json) {
    opts.yes = true;
  }
  if (opts.update) {
    opts.bin = true;
    opts.yes = true;
  }

  const mutationFlags = opts.all || opts.bin || opts.completions || opts.skill || opts.mcp || opts.update || opts.uninstall;
  if (opts.status && mutationFlags) {
    return "--status is mutually exclusive with install/update/uninstall targets.";
  }
  if (opts.update && (opts.all || opts.bin || opts.completions || opts.skill || opts.mcp || opts.uninstall || opts.status)) {
    return "--update cannot be combined with other target flags.";
  }
  if (opts.uninstall && (opts.all || opts.update || opts.status)) {
    return "--uninstall cannot be combined with --all, --update, or --status.";
  }
  if (!opts.status && !opts.update && !opts.uninstall) {
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

/** Main install command orchestrator. */
export async function cliInstall(root: CliProgram, rawOpts: Record<string, string>): Promise<never> {
  const opts = parseInstallOpts(rawOpts);
  const err = validateOpts(opts);
  if (err) {
    installErr(err);
    process.exit(1);
  }

  const paths = resolveInstallPaths(root, opts);

  if (opts.status) {
    printInstallStatus(root, opts);
    process.exit(0);
  }

  // MCP conflict checks before planning
  if (!opts.uninstall && resolveCapabilities(root).mcp && (opts.all || opts.mcp)) {
    const entry = expectedMcpEntry(root);
    const yes = !!opts.yes;
    for (const p of [paths.cursorMcpPath, paths.claudeMcpPath]) {
      const conflict = checkMcpConflict(p, paths.mcpName, entry, yes);
      if (conflict) {
        installErr(conflict);
        process.exit(1);
      }
    }
  }

  let actions: Array<InstallAction | UninstallAction>;
  if (opts.uninstall) {
    actions = buildUninstallPlan(root, paths, opts);
  } else if (opts.update) {
    actions = buildUpdatePlan(root, paths, opts);
  } else {
    actions = buildInstallPlan(root, paths, opts);
  }

  if (actions.length === 0) {
    installErr("Nothing to do.");
    process.exit(1);
  }

  if (!opts.quiet && !opts.json) {
    installOut("About to " + (opts.uninstall ? "remove" : opts.update ? "update" : "install") + ":", opts);
    for (const a of actions) {
      installOut("  - " + a.summary, opts);
    }
  }

  const autoYes = opts.yes || opts.json || opts.update;
  if (!autoYes) {
    if (!process.stdin.isTTY) {
      installErr("Refusing to proceed without --yes (stdin is not a TTY).");
      process.exit(1);
    }
    if (!promptConfirm()) {
      installErr("Aborted.");
      process.exit(1);
    }
  }

  const changed = executePlan(root, actions, opts);

  if (opts.json) {
    process.stdout.write(JSON.stringify(changed, null, 2) + "\n");
    process.exit(0);
  }

  if (!opts.quiet && changed.length > 0) {
    const verb = opts.uninstall ? "Removed" : opts.update ? "Updated" : "Installed";
    installOut(`${verb} ${changed.length} file(s).`, opts);
    if (!opts.uninstall && (opts.all || opts.bin) && changed.some((p) => p === paths.bashRc || p === paths.zshRc || p === paths.binaryPath)) {
      installOut("Open a new shell, or run: hash -r (bash) / rehash (zsh)", opts);
    }
  }

  process.exit(0);
}

export { parseInstallOpts };
