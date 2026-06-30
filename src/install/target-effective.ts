import { resolveCapabilities } from "../capabilities.ts";
import type {
  CliInstallConfig,
  CliInstallTargets,
  CliProgram,
  InstallAgentIntegration,
  InstallTargetSpec,
} from "../types.ts";
import type { InstallPaths } from "./paths.ts";
import { AGENT_PAIRS, INSTALL_ARTIFACT_KEYS, installTargetForKey } from "./target-registry.ts";
import type { CliInstallArtifactKey, InstallPlanMode } from "./target-types.ts";

export type { InstallTargetSpec, ResolvedInstallTarget } from "../types.ts";

export type { InstallPlanMode, InstallScope } from "./target-types.ts";

export function resolveAgentIntegration(
  install?: CliInstallConfig,
  mcpEnabled = false,
): InstallAgentIntegration {
  return install?.agentIntegration ?? (mcpEnabled ? "mcp" : "skill");
}

/** Resolves a boolean or object target spec against category defaults. */
export function resolveInstallTargetSpec(
  spec: InstallTargetSpec | undefined,
  defaults: { enabled: boolean; includedInAll: boolean },
): { enabled: boolean; includedInAll: boolean } {
  if (spec === undefined) {
    return { ...defaults };
  }
  if (typeof spec === "boolean") {
    return {
      enabled: spec,
      includedInAll: spec ? defaults.includedInAll : false,
    };
  }
  return {
    enabled: spec.enabled ?? defaults.enabled,
    includedInAll: spec.includedInAll ?? defaults.includedInAll,
  };
}

function artifactDefaults(
  key: CliInstallArtifactKey,
  integration: InstallAgentIntegration,
): { enabled: boolean; includedInAll: boolean } {
  const target = installTargetForKey(key);
  const includedInAll = target?.defaultIncludedInAll(integration) ?? false;
  return { enabled: true, includedInAll };
}

function applyAgentPairDedupe(
  out: Record<CliInstallArtifactKey, { enabled: boolean; includedInAll: boolean }>,
  user: CliInstallTargets | undefined,
  integration: InstallAgentIntegration,
): void {
  if (integration === "both") return;

  for (const [mcpKey, skillKey] of AGENT_PAIRS) {
    const mcp = out[mcpKey];
    const skill = out[skillKey];
    if (!mcp.includedInAll || !skill.includedInAll) continue;

    const mcpKeyExplicit = user?.[mcpKey] !== undefined;
    const skillKeyExplicit = user?.[skillKey] !== undefined;

    if (mcpKeyExplicit && !skillKeyExplicit) continue;
    if (skillKeyExplicit && !mcpKeyExplicit) continue;

    if (integration === "mcp") {
      out[skillKey] = { ...skill, includedInAll: false };
    } else {
      out[mcpKey] = { ...mcp, includedInAll: false };
    }
  }
}

/** Effective per-artifact gates for install.targets. */
export function resolveEffectiveInstallTargets(
  install?: CliInstallConfig,
  program?: Pick<CliProgram, "mcpServer">,
): Record<CliInstallArtifactKey, { enabled: boolean; includedInAll: boolean }> {
  const mcpEnabled = program?.mcpServer?.enabled === true;
  const integration = resolveAgentIntegration(install, mcpEnabled);
  const user = install?.targets;
  const out = {} as Record<CliInstallArtifactKey, { enabled: boolean; includedInAll: boolean }>;
  for (const key of INSTALL_ARTIFACT_KEYS) {
    out[key] = resolveInstallTargetSpec(user?.[key], artifactDefaults(key, integration));
  }
  applyAgentPairDedupe(out, user, integration);
  return out;
}

/** MCP enabled check for scoped uninstall/install mcp category. */
export function mcpCategoryEnabled(root: CliProgram): boolean {
  return resolveCapabilities(root).mcp;
}

export interface InstallTargetPreview {
  agentIntegration: InstallAgentIntegration;
  all: CliInstallArtifactKey[];
  mcp: CliInstallArtifactKey[];
  skill: CliInstallArtifactKey[];
}

/** Derives plan mode from install CLI flags. */
export function resolveInstallPlanMode(opts: {
  all?: boolean;
  app?: boolean;
  completions?: boolean;
  skill?: boolean;
  mcp?: boolean;
  configure?: boolean;
  uninstall?: boolean;
  reinstall?: boolean;
}): InstallPlanMode {
  if (opts.reinstall) return "refresh";
  if (opts.uninstall) return opts.all ? "uninstall-all" : "uninstall-scoped";
  if (opts.all) return "install-all";
  return "install-scoped";
}

/** @deprecated Use target registry. */
export function isInstallTargetAvailable(
  key: CliInstallArtifactKey,
  root: CliProgram,
  paths: InstallPaths,
): boolean {
  return installTargetForKey(key)?.isAvailable(root, paths) ?? false;
}
