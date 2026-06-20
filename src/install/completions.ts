import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CliCommand } from "../types.ts";
import { completionBashScript, completionFishScript, completionZshScript } from "../builtins/index.ts";
import { cliPresentationRoot } from "../builtins/presentation.ts";
import { InstallPaths } from "./paths.ts";
import { detectShells } from "./shell.ts";

/** Writes shell completion scripts for detected shells. */
export function installCompletions(root: CliCommand, paths: InstallPaths, dry: boolean): string[] {
  const changed: string[] = [];
  const shells = detectShells();
  const schema = cliPresentationRoot(root);

  if (shells.bash) {
    if (!dry) {
      mkdirSync(dirname(paths.bashCompletion), { recursive: true });
      writeFileSync(paths.bashCompletion, completionBashScript(schema), "utf8");
    }
    changed.push(paths.bashCompletion);
  }

  if (shells.zsh) {
    if (!dry) {
      mkdirSync(dirname(paths.zshCompletion), { recursive: true });
      writeFileSync(paths.zshCompletion, completionZshScript(schema), "utf8");
    }
    changed.push(paths.zshCompletion);
  }

  if (shells.fish) {
    if (!dry) {
      mkdirSync(dirname(paths.fishCompletion), { recursive: true });
      writeFileSync(paths.fishCompletion, completionFishScript(schema), "utf8");
    }
    changed.push(paths.fishCompletion);
  }

  return changed;
}

/** Removes shell completion files. */
export function uninstallCompletions(paths: InstallPaths, dry: boolean): string[] {
  const changed: string[] = [];
  for (const p of [paths.bashCompletion, paths.zshCompletion, paths.fishCompletion]) {
    if (existsSync(p)) {
      if (!dry) unlinkSync(p);
      changed.push(p);
    }
  }
  return changed;
}
