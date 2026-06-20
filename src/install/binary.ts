import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CliCommand } from "../types.ts";
import { InstallPaths } from "./paths.ts";
import {
  buildPathRcBlock,
  buildZshFpathRcBlock,
  detectShells,
  hasRcBlock,
  removeRcBlock,
} from "./shell.ts";

export interface BinaryInstallResult {
  changedFiles: string[];
  patchedBashRc: boolean;
  patchedZshRc: boolean;
}

/** Copies the running binary to the install path and patches rc files when shells are detected. */
export function installBinary(root: CliCommand, paths: InstallPaths, dry: boolean): BinaryInstallResult {
  const changed: string[] = [];
  const shells = detectShells();
  let patchedBashRc = false;
  let patchedZshRc = false;

  if (!dry) {
    mkdirSync(paths.bindir, { recursive: true });
    copyFileSync(process.execPath, paths.binaryPath);
  }
  changed.push(paths.binaryPath);

  if (shells.bash && existsSync(dirname(paths.bashRc))) {
    const block = buildPathRcBlock(root.key, paths.bindir);
    let content = existsSync(paths.bashRc) ? readFileSync(paths.bashRc, "utf8") : "";
    if (!hasRcBlock(content, root.key, "path")) {
      if (!content.endsWith("\n") && content.length > 0) content += "\n";
      content += block + "\n";
      if (!dry) writeFileSync(paths.bashRc, content, "utf8");
      changed.push(paths.bashRc);
      patchedBashRc = true;
    }
  }

  if (shells.zsh) {
    const completionsDir = join(dirname(paths.zshCompletion));
    const block = buildZshFpathRcBlock(root.key, completionsDir);
    let content = existsSync(paths.zshRc) ? readFileSync(paths.zshRc, "utf8") : "";
    if (!hasRcBlock(content, root.key, "fpath")) {
      if (!content.endsWith("\n") && content.length > 0) content += "\n";
      content += block + "\n";
      if (!dry) writeFileSync(paths.zshRc, content, "utf8");
      changed.push(paths.zshRc);
      patchedZshRc = true;
    }
  }

  return { changedFiles: changed, patchedBashRc, patchedZshRc };
}

/** Removes binary and rc marker blocks. */
export function uninstallBinary(root: CliCommand, paths: InstallPaths, dry: boolean): string[] {
  const changed: string[] = [];
  if (existsSync(paths.binaryPath)) {
    if (!dry) unlinkSync(paths.binaryPath);
    changed.push(paths.binaryPath);
  }

  for (const [rcPath, tag] of [
    [paths.bashRc, "path"],
    [paths.zshRc, "fpath"],
  ] as const) {
    if (!existsSync(rcPath)) continue;
    const content = readFileSync(rcPath, "utf8");
    if (hasRcBlock(content, root.key, tag)) {
      const next = removeRcBlock(content, root.key, tag);
      if (!dry) writeFileSync(rcPath, next, "utf8");
      changed.push(rcPath);
    }
  }

  return changed;
}
