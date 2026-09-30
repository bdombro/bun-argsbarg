import type { AppSpec, ConfigureConfig, InstallTargetSpec } from "../../core/types.ts";
import { resolveCapabilities } from "../../runtime/capabilities.ts";
import { INSTALL_ARTIFACT_KEYS, installTargetForKey, mcpServerRequiredForArtifact } from "./target-registry.ts";
import type { InstallArtifactKey, InstallPlanMode } from "./target-types.ts";

export type { InstallTargetSpec, ResolvedInstallTarget } from "../../core/types.ts";

export type { InstallPlanMode, InstallScope } from "./target-types.ts";

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
  key: InstallArtifactKey,
  program?: Pick<AppSpec, "mcpServer">,
): { enabled: boolean; includedInAll: boolean } {
  if (key === "skill") {
    return { enabled: false, includedInAll: false };
  }
  if (key === "agentsMcp") {
    const on = program?.mcpServer?.enabled === true;
    return { enabled: on, includedInAll: on };
  }
  const target = installTargetForKey(key);
  if (!mcpServerRequiredForArtifact(key, program?.mcpServer?.enabled === true)) {
    return { enabled: false, includedInAll: false };
  }
  return { enabled: true, includedInAll: target?.defaultIncludedInAll() ?? false };
}

/** Effective per-artifact gates for install.targets. */
export function resolveEffectiveInstallTargets(
  configure?: ConfigureConfig,
  program?: Pick<AppSpec, "mcpServer">,
): Record<InstallArtifactKey, { enabled: boolean; includedInAll: boolean }> {
  const user = configure?.targets;
  const out = {} as Record<InstallArtifactKey, { enabled: boolean; includedInAll: boolean }>;
  for (const key of INSTALL_ARTIFACT_KEYS) {
    const userSpec = key === "skill" || key === "agentsMcp" ? undefined : user?.[key];
    out[key] = resolveInstallTargetSpec(userSpec, artifactDefaults(key, program));
  }
  return out;
}

/** MCP enabled check for scoped uninstall/install mcp category. */
export function mcpCategoryEnabled(root: AppSpec): boolean {
  return resolveCapabilities(root).mcp;
}

export interface InstallTargetPreview {
  all: InstallArtifactKey[];
  mcp: InstallArtifactKey[];
  skill: InstallArtifactKey[];
}

/** Derives plan mode from install CLI flags. */
export function resolveInstallPlanMode(opts: {
  all?: boolean;
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
