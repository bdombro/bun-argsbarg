import type { CliProgram } from "../../core/types.ts";
import type { InstallPaths } from "./paths.ts";

export type { InstallTargetSpec, ResolvedInstallTarget } from "../../core/types.ts";

export type InstallPlanMode = "install-all" | "install-scoped" | "uninstall-all" | "uninstall-scoped" | "refresh";

export interface InstallScope {
  all?: boolean;
  skill?: boolean;
  mcp?: boolean;
  configure?: boolean;
  uninstall?: boolean;
}

/** Artifact keys for install.targets. */
export type CliInstallArtifactKey = "app" | "agentsMcp" | "configure" | "skill";

export type InstallActionKind = "app" | "agent-skill" | "agents-mcp" | "configure";

export type InstallTargetCategory = "core" | "skill" | "mcp";

export interface InstallAction {
  kind: InstallActionKind;
  summary: string;
  message: string;
  run: () => string[];
}

export interface UninstallAction {
  kind?: InstallActionKind | "configure";
  summary: string;
  message: string;
  run: () => string[];
}

export interface InstalledArtifacts {
  app: boolean;
  skill: boolean;
  agentsMcp: boolean;
}

export interface InstallStatus {
  app?: string;
  skill?: string;
  agentsMcp?: string;
}

export interface DetectedSnapshot extends InstalledArtifacts {
  appConfig?: boolean;
}

export interface InstallOpts {
  all?: boolean;
  skill?: boolean;
  mcp?: boolean;
  reinstall?: boolean;
  status?: boolean;
  uninstall?: boolean;
  configure?: boolean;
  yes?: boolean;
  dry?: boolean;
  json?: boolean;
}

export interface TargetPlanContext {
  root: CliProgram;
  paths: InstallPaths;
  opts: InstallOpts;
  dry: boolean;
  detected: DetectedSnapshot;
  effective: Record<CliInstallArtifactKey, { enabled: boolean; includedInAll: boolean }>;
  scope: InstallScope;
  mode: InstallPlanMode;
  include: (key: CliInstallArtifactKey) => boolean;
}
