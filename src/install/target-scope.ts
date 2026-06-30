import { existsSync } from "node:fs";
import { resolveCapabilities } from "../capabilities.ts";
import { appConfigInstalled } from "../config/file.ts";
import type { CliInstallTargets, CliProgram } from "../types.ts";
import type { InstallPaths } from "./paths.ts";
import {
  type InstallPlanMode,
  type InstallScope,
  type InstallTargetPreview,
  resolveAgentIntegration,
  resolveEffectiveInstallTargets,
  resolveInstallPlanMode,
} from "./target-effective.ts";
import {
  INSTALL_ARTIFACT_KEYS,
  INSTALL_TARGETS,
  installTargetForKey,
  MCP_KEYS,
  SKILL_KEYS,
} from "./target-registry.ts";
import type {
  CliInstallArtifactKey,
  DetectedSnapshot,
  InstalledArtifacts,
  InstallOpts,
  TargetPlanContext,
} from "./target-types.ts";

export { mcpCategoryEnabled } from "./target-effective.ts";

function emptyInstalledArtifacts(): InstalledArtifacts {
  return {
    app: false,
    bashCompletion: false,
    zshCompletion: false,
    fishCompletion: false,
    cursorSkill: false,
    claudeSkill: false,
    codexSkill: false,
    opencodeSkill: false,
    openclawSkill: false,
    cursorMcp: false,
    claudeMcp: false,
    claudeDesktopMcp: false,
    opencodeMcp: false,
    codexMcp: false,
    openclawMcp: false,
    chatGptMcp: false,
    bashRcPath: false,
    zshRcFpath: false,
  };
}

/** Detects which install artifacts are currently present. */
export function detectInstalledArtifacts(
  paths: InstallPaths,
  root: CliProgram,
): InstalledArtifacts {
  const out = emptyInstalledArtifacts();
  for (const target of INSTALL_TARGETS) {
    target.applyDetected(paths, root, out);
  }
  return out;
}

function isNonInteractiveInstall(opts: InstallOpts): boolean {
  return !!(opts.yes || opts.json || opts.reinstall || opts.update || opts.dry);
}

/** Scope flags; non-interactive `install --mcp` implicitly includes app. */
export function resolveInstallScope(opts: InstallOpts): InstallScope {
  const assumeApp =
    !opts.uninstall && opts.mcp && !opts.all && !opts.app && isNonInteractiveInstall(opts);
  return {
    all: opts.all,
    app: opts.app || assumeApp,
    completions: opts.completions,
    skill: opts.skill,
    mcp: opts.mcp,
    configure: opts.configure,
    uninstall: opts.uninstall,
  };
}

/** Builds detected snapshot including app config for plan scoping. */
export function buildDetectedSnapshot(root: CliProgram, paths: InstallPaths): DetectedSnapshot {
  const base = detectInstalledArtifacts(paths, root);
  return {
    ...base,
    appConfig: root.appConfig ? appConfigInstalled(root) : false,
  };
}

function targetExplicitlyConfigured(
  user: CliInstallTargets | undefined,
  key: CliInstallArtifactKey,
): boolean {
  return user?.[key] !== undefined;
}

function agentCategoryInScope(
  key: CliInstallArtifactKey,
  categoryKeys: readonly CliInstallArtifactKey[],
  category: "skill" | "mcp",
  effective: Record<CliInstallArtifactKey, { enabled: boolean; includedInAll: boolean }>,
  targets: CliInstallTargets | undefined,
  root: CliProgram,
): boolean {
  if (!categoryKeys.includes(key)) return false;
  if (!effective[key].enabled) return false;
  if (category === "mcp" && !resolveCapabilities(root).mcp) return false;
  return effective[key].includedInAll || targetExplicitlyConfigured(targets, key);
}

/** Whether an artifact is in scope for the current CLI flags and install mode. */
export function isArtifactInScope(
  key: CliInstallArtifactKey,
  scope: InstallScope,
  effective: Record<CliInstallArtifactKey, { enabled: boolean; includedInAll: boolean }>,
  mode: InstallPlanMode,
  root: CliProgram,
  targets?: CliInstallTargets,
): boolean {
  if (mode === "uninstall-all") {
    return true;
  }

  if (mode === "refresh") {
    return effective[key].enabled;
  }

  if (mode === "install-all") {
    const t = effective[key];
    return t.enabled && t.includedInAll;
  }

  const scoped =
    scope.app || scope.completions || scope.skill || scope.mcp || scope.configure || false;

  if (mode === "uninstall-scoped" || mode === "install-scoped") {
    if (!effective[key].enabled) return false;
    if (scope.configure) return key === "configure";
    if (scope.app) return key === "app";
    if (scope.completions) return key === "completions";
    if (scope.skill) {
      return agentCategoryInScope(key, SKILL_KEYS, "skill", effective, targets, root);
    }
    if (scope.mcp) {
      return agentCategoryInScope(key, MCP_KEYS, "mcp", effective, targets, root);
    }
    if (!scoped && mode === "install-scoped") return false;
    return false;
  }

  return false;
}

/** Whether to include an artifact in the current install/uninstall/refresh plan. */
export function shouldIncludeArtifact(
  key: CliInstallArtifactKey,
  root: CliProgram,
  paths: InstallPaths,
  scope: InstallScope,
  mode: InstallPlanMode,
  effective: Record<CliInstallArtifactKey, { enabled: boolean; includedInAll: boolean }>,
  detected?: Partial<Record<CliInstallArtifactKey, boolean>>,
): boolean {
  const target = installTargetForKey(key);
  const targets = root.install?.targets;

  if (key !== "configure" && target && !target.isAvailable(root, paths)) {
    return false;
  }
  if (key === "configure" && !root.appConfig) {
    return false;
  }
  if (mode === "refresh" && detected) {
    if (!detected[key]) return false;
  }
  if ((mode === "uninstall-all" || mode === "uninstall-scoped") && detected) {
    const det = detected[key];
    if (key === "configure") {
      if (!det) return false;
    } else if (mode === "uninstall-scoped") {
      if (!isArtifactInScope(key, scope, effective, mode, root, targets)) return false;
      if (!det) return false;
    } else if (!det) {
      return false;
    }
  }
  if (mode === "uninstall-all") {
    return true;
  }
  if (mode === "uninstall-scoped") {
    return isArtifactInScope(key, scope, effective, mode, root, targets);
  }
  if (mode === "refresh") {
    return effective[key].enabled;
  }
  return isArtifactInScope(key, scope, effective, mode, root, targets);
}

/** Builds plan context shared by install and uninstall planners. */
export function buildTargetPlanContext(
  root: CliProgram,
  paths: InstallPaths,
  opts: InstallOpts,
  detected: DetectedSnapshot,
): TargetPlanContext {
  const effective = resolveEffectiveInstallTargets(root.install, root);
  const mode = resolveInstallPlanMode(opts);
  const scope = resolveInstallScope(opts);
  const detPartial = Object.fromEntries(
    INSTALL_TARGETS.map((t) => [t.key, t.detectedForSnapshot(detected)]),
  ) as Partial<Record<CliInstallArtifactKey, boolean>>;

  const include = (key: CliInstallArtifactKey) =>
    shouldIncludeArtifact(key, root, paths, scope, mode, effective, detPartial);

  return {
    root,
    paths,
    opts,
    dry: !!opts.dry,
    detected,
    effective,
    scope,
    mode,
    include,
  };
}

/** Maps detected snapshot to artifact key (for tests and legacy callers). */
export function detectedForArtifact(
  key: CliInstallArtifactKey,
  detected: DetectedSnapshot,
): boolean {
  const target = installTargetForKey(key);
  if (key === "completions") {
    return detected.bashCompletion || detected.zshCompletion || detected.fishCompletion;
  }
  if (key === "configure") {
    return detected.appConfig ?? false;
  }
  return target?.detectedForSnapshot(detected) ?? false;
}

/** Resolved artifact keys for `--all`, `--mcp`, and `--skill` (availability-gated). */
export function resolveInstallTargetPreview(
  program: CliProgram,
  paths: InstallPaths,
): InstallTargetPreview {
  const effective = resolveEffectiveInstallTargets(program.install, program);
  const integration = resolveAgentIntegration(program.install, program.mcpServer?.enabled === true);

  const keysForScope = (scope: InstallScope, mode: InstallPlanMode): CliInstallArtifactKey[] =>
    INSTALL_ARTIFACT_KEYS.filter((key) =>
      shouldIncludeArtifact(key, program, paths, scope, mode, effective),
    );

  return {
    agentIntegration: integration,
    all: keysForScope({ all: true }, "install-all"),
    mcp: keysForScope({ mcp: true }, "install-scoped"),
    skill: keysForScope({ skill: true }, "install-scoped"),
  };
}
