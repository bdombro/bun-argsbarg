import { CliProgram } from "../types.ts";
import { buildInstallStatus, detectInstalledArtifacts } from "./detect-installed.ts";
import type { InstallOpts } from "./plan.ts";
import { resolveInstallPaths } from "./paths.ts";

export function installOut(msg: string, opts: InstallOpts): void {
  if (opts.quiet || opts.json) return;
  process.stdout.write(msg + "\n");
}

export function installInfo(msg: string, opts: InstallOpts): void {
  if (opts.quiet) return;
  if (opts.json && !opts.dry) return;
  const prefix = opts.dry ? "[dry run] " : "";
  process.stderr.write(prefix + msg + "\n");
}

export function installErr(msg: string): void {
  process.stderr.write(msg + "\n");
}

/** Prints install status to stdout (human or JSON). */
export function printInstallStatus(root: CliProgram, opts: InstallOpts): void {
  const paths = resolveInstallPaths(root, opts);
  const detected = detectInstalledArtifacts(paths);
  const status = buildInstallStatus(paths, detected);

  if (opts.json) {
    const json: Record<string, string> = {};
    if (status.binary) json.binary = status.binary;
    if (status.bashCompletion) json.bashCompletion = status.bashCompletion;
    if (status.zshCompletion) json.zshCompletion = status.zshCompletion;
    if (status.fishCompletion) json.fishCompletion = status.fishCompletion;
    if (status.cursorSkill) json.cursorSkill = status.cursorSkill;
    if (status.claudeSkill) json.claudeSkill = status.claudeSkill;
    if (status.cursorMcp) json.cursorMcp = status.cursorMcp;
    if (status.claudeMcp) json.claudeMcp = status.claudeMcp;
    if (status.claudeDesktopMcp) json.claudeDesktopMcp = status.claudeDesktopMcp;
    process.stdout.write(JSON.stringify(json, null, 2) + "\n");
    return;
  }

  installOut(`Installed artifacts for ${root.key}:`, opts);
  const lines: [string, string | undefined][] = [
    ["binary", status.binary],
    ["bash completion", status.bashCompletion],
    ["zsh completion", status.zshCompletion],
    ["fish completion", status.fishCompletion],
    ["cursor skill", status.cursorSkill],
    ["claude skill", status.claudeSkill],
    ["cursor mcp", status.cursorMcp],
    ["claude code mcp", status.claudeMcp],
    ["claude desktop mcp", status.claudeDesktopMcp],
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
}
