import { appConfigStatus } from "../../config/bootstrap.ts";
import type { CliProgram } from "../../core/types.ts";
import { buildInstallStatus, detectInstalledArtifacts } from "./detect-installed.ts";
import { resolveInstallPaths } from "./paths.ts";
import { resolveInstallTargetPreview } from "./target-scope.ts";
import type { InstallOpts } from "./target-types.ts";

export function installOut(msg: string, opts: InstallOpts): void {
  if (opts.json) return;
  process.stdout.write(`${msg}\n`);
}

export function installInfo(msg: string, opts: InstallOpts): void {
  if (opts.json && !opts.dry) return;
  const prefix = opts.dry ? "[dry run] " : "";
  process.stderr.write(`${prefix + msg}\n`);
}

export function installErr(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

/** Interactive install/uninstall banner (stderr; leading blank line). */
export function writeInteractiveInstallIntro(root: CliProgram): void {
  process.stderr.write(`\n${root.key} Setup\n\n`);
}

/** Prints install status to stdout (human or JSON). */
export function printInstallStatus(root: CliProgram, opts: InstallOpts): void {
  const paths = resolveInstallPaths(root);
  const detected = detectInstalledArtifacts(paths, root);
  const status = buildInstallStatus(paths, detected, root);

  if (opts.json) {
    const preview = resolveInstallTargetPreview(root, paths);
    const json: Record<string, unknown> = {
      effective: {
        all: preview.all,
        mcp: preview.mcp,
        skill: preview.skill,
      },
    };
    if (status.app) json.app = status.app;
    if (status.skill) json.skill = status.skill;
    if (status.agentsMcp) json.agentsMcp = status.agentsMcp;
    process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    return;
  }

  installOut(`Installed artifacts for ${root.key}:`, opts);
  const lines: [string, string | undefined][] = [
    ["app", status.app],
    ["agent skill", status.skill],
    [".agents mcp", status.agentsMcp],
  ];
  let any = false;
  for (const [label, value] of lines) {
    if (value) {
      installOut(`  ${label}: ${value}`, opts);
      any = true;
    }
  }
  if (!any) {
    installOut("  (none detected)", opts);
  }

  const configStatus = appConfigStatus(root);
  if (configStatus) {
    installOut(`  app config: ${configStatus}`, opts);
  }
}
