import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCapabilities } from "../capabilities.ts";
import { CliProgram } from "../types.ts";
import { installBinary } from "./binary.ts";
import { installCompletions } from "./completions.ts";
import { detectInstalledArtifacts } from "./detect-installed.ts";
import { expectedMcpEntry, mergeMcpConfig } from "./mcp-config.ts";
import {
  checkCodexMcpConflict,
  codexMcpHasServer,
  codexOnPath,
  mergeCodexMcpConfig,
  removeCodexMcpConfig,
} from "./mcp-codex.ts";
import {
  checkOpenCodeMcpConflict,
  expectedOpenCodeMcpEntry,
  mergeOpenCodeMcpConfig,
  opencodePresent,
} from "./mcp-opencode.ts";
import { InstallPaths, userHome, chatGptDesktopPresent, claudeDesktopPresent } from "./paths.ts";
import { detectShells } from "./shell.ts";

export interface InstallOpts {
  all?: boolean;
  bin?: boolean;
  completions?: boolean;
  skill?: boolean;
  mcp?: boolean;
  reinstall?: boolean;
  update?: boolean;
  from?: string;
  status?: boolean;
  uninstall?: boolean;
  yes?: boolean;
  dry?: boolean;
  json?: boolean;
  quiet?: boolean;
  prefix?: string;
}

export type InstallActionKind =
  | "binary"
  | "completions"
  | "cursor-skill"
  | "claude-skill"
  | "cursor-mcp"
  | "claude-mcp"
  | "claude-desktop-mcp"
  | "opencode-mcp"
  | "codex-mcp"
  | "chatgpt-desktop-mcp";

export interface InstallAction {
  kind: InstallActionKind;
  summary: string;
  message: string;
  run: () => string[];
}

export function wantsInstallBin(opts: InstallOpts): boolean {
  return !!(opts.all || opts.bin || opts.reinstall);
}

export function wantsInstallCompletions(opts: InstallOpts): boolean {
  return !!(opts.all || opts.completions);
}

export function wantsInstallSkill(opts: InstallOpts): boolean {
  return !!(opts.all || opts.skill);
}

export function wantsInstallMcp(opts: InstallOpts, root: CliProgram): boolean {
  return !!(opts.mcp || opts.all) && resolveCapabilities(root).mcp;
}

/** Builds install actions for normal mode (--all / scoped targets). */
export function buildInstallPlan(root: CliProgram, paths: InstallPaths, opts: InstallOpts): InstallAction[] {
  const actions: InstallAction[] = [];
  const dry = !!opts.dry;

  if (wantsInstallBin(opts)) {
    const sourcePath = opts.from ?? process.execPath;
    actions.push({
      kind: "binary",
      summary: `binary: ${paths.binaryPath}`,
      message: `Installing binary to ${paths.binaryPath}`,
      run: () => installBinary(root, paths, dry, sourcePath).changedFiles,
    });
  }

  if (wantsInstallCompletions(opts)) {
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

  if (wantsInstallSkill(opts)) {
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

  if (wantsInstallMcp(opts, root)) {
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
      summary: `claude code mcp: ${paths.claudeMcpPath} (server "${paths.mcpName}")`,
      message: `Merging MCP server "${paths.mcpName}" into ${paths.claudeMcpPath}`,
      run: () => {
        mergeMcpConfig(paths.claudeMcpPath, paths.mcpName, entry, dry);
        return [paths.claudeMcpPath];
      },
    });
    if (claudeDesktopPresent(userHome(), paths.claudeDesktopMcpPath)) {
      actions.push({
        kind: "claude-desktop-mcp",
        summary: `claude desktop mcp: ${paths.claudeDesktopMcpPath} (server "${paths.mcpName}")`,
        message: `Merging MCP server "${paths.mcpName}" into ${paths.claudeDesktopMcpPath}`,
        run: () => {
          mergeMcpConfig(paths.claudeDesktopMcpPath, paths.mcpName, entry, dry);
          return [paths.claudeDesktopMcpPath];
        },
      });
    }
    if (opencodePresent(userHome())) {
      const openCodeEntry = expectedOpenCodeMcpEntry(root);
      actions.push({
        kind: "opencode-mcp",
        summary: `opencode mcp: ${paths.opencodeMcpPath} (server "${paths.mcpName}")`,
        message: `Merging MCP server "${paths.mcpName}" into ${paths.opencodeMcpPath}`,
        run: () => {
          mergeOpenCodeMcpConfig(paths.opencodeMcpPath, paths.mcpName, openCodeEntry, dry);
          return [paths.opencodeMcpPath];
        },
      });
    }
    if (codexOnPath()) {
      actions.push({
        kind: "codex-mcp",
        summary: `codex mcp: ${paths.codexConfigPath} (server "${paths.mcpName}")`,
        message: `Registering MCP server "${paths.mcpName}" via codex mcp add`,
        run: () => {
          const configPath = mergeCodexMcpConfig(userHome(), paths.mcpName, entry, dry, !!opts.yes);
          return [configPath];
        },
      });
    }
    if (chatGptDesktopPresent(userHome(), paths.chatGptMcpPath)) {
      actions.push({
        kind: "chatgpt-desktop-mcp",
        summary: `chatgpt desktop mcp: ${paths.chatGptMcpPath} (server "${paths.mcpName}")`,
        message: `Merging MCP server "${paths.mcpName}" into ${paths.chatGptMcpPath}`,
        run: () => {
          mergeMcpConfig(paths.chatGptMcpPath, paths.mcpName, entry, dry);
          return [paths.chatGptMcpPath];
        },
      });
    }
  }

  return actions;
}

/** Builds update actions for artifacts already installed. */
export function buildUpdatePlan(root: CliProgram, paths: InstallPaths, opts: InstallOpts): InstallAction[] {
  const detected = detectInstalledArtifacts(paths);
  const scoped: InstallOpts = {
    bin: true,
    completions: detected.bashCompletion || detected.zshCompletion || detected.fishCompletion,
    skill: detected.cursorSkill || detected.claudeSkill,
    mcp:
      (detected.cursorMcp ||
        detected.claudeMcp ||
        detected.claudeDesktopMcp ||
        detected.opencodeMcp ||
        detected.codexMcp ||
        detected.chatGptMcp) &&
      resolveCapabilities(root).mcp,
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
      case "claude-desktop-mcp":
        return detected.claudeDesktopMcp;
      case "opencode-mcp":
        return detected.opencodeMcp;
      case "codex-mcp":
        return detected.codexMcp;
      case "chatgpt-desktop-mcp":
        return detected.chatGptMcp;
      default:
        return false;
    }
  });
}
