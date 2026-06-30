import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { CliProgram } from "../types.ts";
import type { InstallPaths } from "./paths.ts";
import {
  buildPathRcBlock,
  buildZshFpathRcBlock,
  detectShells,
  hasRcBlock,
  removeRcBlock,
} from "./shell.ts";

export interface AppInstallResult {
  changedFiles: string[];
  patchedBashRc: boolean;
  patchedZshRc: boolean;
}

/** Copies the app executable to the install path and patches rc files when shells are detected. */
export function installApp(
  root: CliProgram,
  paths: InstallPaths,
  dry: boolean,
  sourcePath: string = process.execPath,
): AppInstallResult {
  const changed: string[] = [];
  const shells = detectShells();
  let patchedBashRc = false;
  let patchedZshRc = false;

  if (!dry) {
    mkdirSync(paths.appDir, { recursive: true });
    copyFileSync(sourcePath, paths.appPath);
  }
  changed.push(paths.appPath);

  if (shells.bash && existsSync(dirname(paths.bashRc))) {
    const block = buildPathRcBlock(root.key, paths.appDir);
    let content = existsSync(paths.bashRc) ? readFileSync(paths.bashRc, "utf8") : "";
    if (!hasRcBlock(content, root.key, "path")) {
      if (!content.endsWith("\n") && content.length > 0) content += "\n";
      content += `${block}\n`;
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
      content += `${block}\n`;
      if (!dry) writeFileSync(paths.zshRc, content, "utf8");
      changed.push(paths.zshRc);
      patchedZshRc = true;
    }
  }

  return { changedFiles: changed, patchedBashRc, patchedZshRc };
}

/** Removes the installed app and rc marker blocks. */
export function uninstallApp(root: CliProgram, paths: InstallPaths, dry: boolean): string[] {
  const changed: string[] = [];
  if (existsSync(paths.appPath)) {
    if (!dry) unlinkSync(paths.appPath);
    changed.push(paths.appPath);
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
