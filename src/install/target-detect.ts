import type { CliProgram } from "../types.ts";
import type { InstallPaths } from "./paths.ts";
import { INSTALL_TARGETS } from "./target-registry.ts";
import type { InstalledArtifacts, InstallStatus } from "./target-types.ts";

export { buildDetectedSnapshot, detectInstalledArtifacts } from "./target-scope.ts";
export type { InstalledArtifacts, InstallStatus } from "./target-types.ts";

/** Builds a status inventory from detected artifacts. */
export function buildInstallStatus(
  paths: InstallPaths,
  detected: InstalledArtifacts,
  root: CliProgram,
): InstallStatus {
  const status: InstallStatus = {};
  for (const target of INSTALL_TARGETS) {
    target.contributeStatus(paths, root, detected, status);
  }
  return status;
}
