import type { CliProgram } from "../types.ts";
import type { InstallPaths } from "./paths.ts";

export type { InstallTargetSpec, ResolvedInstallTarget } from "../types.ts";

export type InstallPlanMode =
  | "install-all"
  | "install-scoped"
  | "uninstall-all"
  | "uninstall-scoped"
  | "refresh";

export interface InstallScope {
  all?: boolean;
  app?: boolean;
  completions?: boolean;
  skill?: boolean;
  mcp?: boolean;
  configure?: boolean;
  uninstall?: boolean;
}

/** Artifact keys for install.targets. */
export type CliInstallArtifactKey =
  | "app"
  | "chatgptMcp"
  | "claudeCodeMcp"
  | "claudeDesktopMcp"
  | "claudeSkill"
  | "codexMcp"
  | "codexSkill"
  | "completions"
  | "configure"
  | "cursorMcp"
  | "cursorSkill"
  | "openclawMcp"
  | "openclawSkill"
  | "opencodeMcp"
  | "opencodeSkill";

export type InstallActionKind =
  | "app"
  | "completions"
  | "cursor-skill"
  | "claude-skill"
  | "codex-skill"
  | "opencode-skill"
  | "openclaw-skill"
  | "cursor-mcp"
  | "claude-mcp"
  | "claude-desktop-mcp"
  | "opencode-mcp"
  | "codex-mcp"
  | "openclaw-mcp"
  | "chatgpt-desktop-mcp"
  | "configure";

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
  bashCompletion: boolean;
  zshCompletion: boolean;
  fishCompletion: boolean;
  cursorSkill: boolean;
  claudeSkill: boolean;
  codexSkill: boolean;
  opencodeSkill: boolean;
  openclawSkill: boolean;
  cursorMcp: boolean;
  claudeMcp: boolean;
  claudeDesktopMcp: boolean;
  opencodeMcp: boolean;
  codexMcp: boolean;
  openclawMcp: boolean;
  chatGptMcp: boolean;
  bashRcPath: boolean;
  zshRcFpath: boolean;
}

export interface InstallStatus {
  app?: string;
  bashCompletion?: string;
  zshCompletion?: string;
  fishCompletion?: string;
  cursorSkill?: string;
  claudeSkill?: string;
  codexSkill?: string;
  opencodeSkill?: string;
  openclawSkill?: string;
  cursorMcp?: string;
  claudeMcp?: string;
  claudeDesktopMcp?: string;
  opencodeMcp?: string;
  codexMcp?: string;
  openclawMcp?: string;
  chatGptMcp?: string;
}

export interface DetectedSnapshot extends InstalledArtifacts {
  appConfig?: boolean;
}

export interface InstallOpts {
  all?: boolean;
  app?: boolean;
  completions?: boolean;
  skill?: boolean;
  mcp?: boolean;
  reinstall?: boolean;
  update?: boolean;
  from?: string;
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
