import type { InstallTarget } from "./target-base.ts";
import type { SkillInstallTarget } from "./target-skill.ts";
import type { CliInstallArtifactKey, InstallActionKind } from "./target-types.ts";
import { INSTALL_TARGETS } from "./targets/index.ts";

export { INSTALL_TARGETS } from "./targets/index.ts";

export const INSTALL_ARTIFACT_KEYS: CliInstallArtifactKey[] = INSTALL_TARGETS.map((t) => t.key);

export const SKILL_KEYS: CliInstallArtifactKey[] = INSTALL_TARGETS.filter(
  (t) => t.category === "skill",
).map((t) => t.key);

export const MCP_KEYS: CliInstallArtifactKey[] = INSTALL_TARGETS.filter(
  (t) => t.category === "mcp",
).map((t) => t.key);

/** Maps plan action kinds to install.targets artifact keys. */
export const ACTION_KIND_TO_ARTIFACT: Record<InstallActionKind, CliInstallArtifactKey> =
  Object.fromEntries(INSTALL_TARGETS.map((t) => [t.actionKind, t.key])) as Record<
    InstallActionKind,
    CliInstallArtifactKey
  >;

/** Hosts with both MCP config and shell skill install targets. */
export const AGENT_PAIRS: [CliInstallArtifactKey, CliInstallArtifactKey][] =
  INSTALL_TARGETS.flatMap((t) =>
    t.category === "mcp" && t.pairedKey !== undefined
      ? [[t.key, t.pairedKey] as [CliInstallArtifactKey, CliInstallArtifactKey]]
      : [],
  );

const targetByKey = new Map(INSTALL_TARGETS.map((t) => [t.key, t]));

/** Lookup a registered install target by artifact key. */
export function installTargetForKey(key: CliInstallArtifactKey): InstallTarget | undefined {
  return targetByKey.get(key);
}

/** Lookup by plan action kind. */
export function installTargetForActionKind(kind: InstallActionKind): InstallTarget | undefined {
  return INSTALL_TARGETS.find((t) => t.actionKind === kind);
}

/** Skill targets for uninstall summary → directory resolution. */
export function skillTargetForUninstallSummary(summary: string): SkillInstallTarget | undefined {
  for (const t of INSTALL_TARGETS) {
    if (
      t.category === "skill" &&
      (t as SkillInstallTarget).uninstallPrefix &&
      summary.startsWith((t as SkillInstallTarget).uninstallPrefix)
    ) {
      return t as SkillInstallTarget;
    }
  }
  return undefined;
}
