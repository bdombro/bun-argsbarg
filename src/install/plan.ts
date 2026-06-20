import { existsSync } from "node:fs";
import { join } from "node:path";
import { CliCommand } from "../types.ts";
import { installBinary } from "./binary.ts";
import { installCompletions } from "./completions.ts";
import { detectInstalledArtifacts } from "./detect-installed.ts";
import { expectedMcpEntry, mergeMcpConfig } from "./mcp-config.ts";
import { InstallPaths, userHome } from "./paths.ts";
import { detectShells } from "./shell.ts";

export interface InstallOpts {
  all?: boolean;
  bin?: boolean;
  completions?: boolean;
  skill?: boolean;
  mcp?: boolean;
  update?: boolean;
  status?: boolean;
  uninstall?: boolean;
  yes?: boolean;
  dry?: boolean;
  json?: boolean;
  quiet?: boolean;
  prefix?: string;
}

export type InstallActionKind = "binary" | "completions" | "cursor-skill" | "claude-skill" | "cursor-mcp" | "claude-mcp";

export interface InstallAction {
  kind: InstallActionKind;
  summary: string;
  message: string;
  run: () => string[];
}

function wantsBin(opts: InstallOpts): boolean {
  return !!(opts.all || opts.bin || opts.update);
}

function wantsCompletions(opts: InstallOpts): boolean {
  return !!(opts.all || opts.completions);
}

function wantsSkill(opts: InstallOpts): boolean {
  return !!(opts.all || opts.skill);
}

function wantsMcp(opts: InstallOpts, root: CliCommand): boolean {
  return !!(opts.all || opts.mcp) && root.mcpServer !== undefined;
}

/** Builds install actions for normal mode (--all / scoped targets). */
export function buildInstallPlan(root: CliCommand, paths: InstallPaths, opts: InstallOpts): InstallAction[] {
  const actions: InstallAction[] = [];
  const dry = !!opts.dry;

  if (wantsBin(opts)) {
    actions.push({
      kind: "binary",
      summary: `binary: ${paths.binaryPath}`,
      message: `Installing binary to ${paths.binaryPath}`,
      run: () => installBinary(root, paths, dry).changedFiles,
    });
  }

  if (wantsCompletions(opts)) {
    const shells = detectShells();
    if (shells.bash) {
      actions.push({
        kind: "completions",
        summary: `bash completion: ${paths.bashCompletion}`,
        message: `Writing bash completion to ${paths.bashCompletion}`,
        run: () => {
          const all = installCompletions(root, paths, dry);
          return all.filter((p) => p === paths.bashCompletion);
        },
      });
    }
    if (shells.zsh) {
      actions.push({
        kind: "completions",
        summary: `zsh completion: ${paths.zshCompletion}`,
        message: `Writing zsh completion to ${paths.zshCompletion}`,
        run: () => {
          const all = installCompletions(root, paths, dry);
          return all.filter((p) => p === paths.zshCompletion);
        },
      });
    }
    if (shells.fish) {
      actions.push({
        kind: "completions",
        summary: `fish completion: ${paths.fishCompletion}`,
        message: `Writing fish completion to ${paths.fishCompletion}`,
        run: () => {
          const all = installCompletions(root, paths, dry);
          return all.filter((p) => p === paths.fishCompletion);
        },
      });
    }
  }

  if (wantsSkill(opts)) {
    const home = userHome();
    if (existsSync(join(home, ".cursor"))) {
      actions.push({
        kind: "cursor-skill",
        summary: `cursor skill: ${paths.cursorSkillDir}/`,
        message: `Installing Cursor skill to ${paths.cursorSkillDir}/`,
        run: () => [],
      });
    }
    if (existsSync(join(home, ".claude"))) {
      actions.push({
        kind: "claude-skill",
        summary: `claude skill: ${paths.claudeSkillDir}/`,
        message: `Installing Claude Code skill to ${paths.claudeSkillDir}/`,
        run: () => [],
      });
    }
  }

  if (wantsMcp(opts, root)) {
    const entry = expectedMcpEntry(root);
    if (existsSync(join(userHome(), ".cursor"))) {
      actions.push({
        kind: "cursor-mcp",
        summary: `cursor mcp: ${paths.cursorMcpPath} (server "${paths.mcpName}")`,
        message: `Merging MCP server "${paths.mcpName}" into ${paths.cursorMcpPath}`,
        run: () => {
          mergeMcpConfig(paths.cursorMcpPath, paths.mcpName, entry, dry);
          return [paths.cursorMcpPath];
        },
      });
    }
    actions.push({
      kind: "claude-mcp",
      summary: `claude mcp: ${paths.claudeMcpPath} (server "${paths.mcpName}")`,
      message: `Merging MCP server "${paths.mcpName}" into ${paths.claudeMcpPath}`,
      run: () => {
        mergeMcpConfig(paths.claudeMcpPath, paths.mcpName, entry, dry);
        return [paths.claudeMcpPath];
      },
    });
  }

  return actions;
}

/** Builds update actions for artifacts already installed. */
export function buildUpdatePlan(root: CliCommand, paths: InstallPaths, opts: InstallOpts): InstallAction[] {
  const detected = detectInstalledArtifacts(paths);
  const scoped: InstallOpts = {
    bin: true,
    completions: detected.bashCompletion || detected.zshCompletion || detected.fishCompletion,
    skill: detected.cursorSkill || detected.claudeSkill,
    mcp: (detected.cursorMcp || detected.claudeMcp) && root.mcpServer !== undefined,
    dry: opts.dry,
  };
  const plan = buildInstallPlan(root, paths, scoped);

  return plan.filter((action) => {
    switch (action.kind) {
      case "binary":
        return true;
      case "completions":
        if (action.summary.startsWith("bash")) return detected.bashCompletion;
        if (action.summary.startsWith("zsh")) return detected.zshCompletion;
        if (action.summary.startsWith("fish")) return detected.fishCompletion;
        return false;
      case "cursor-skill":
        return detected.cursorSkill;
      case "claude-skill":
        return detected.claudeSkill;
      case "cursor-mcp":
        return detected.cursorMcp;
      case "claude-mcp":
        return detected.claudeMcp;
      default:
        return false;
    }
  });
}
