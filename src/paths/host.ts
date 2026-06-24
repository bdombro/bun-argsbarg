/*
Shared host path primitives for install, config, and skill modules.
*/

import { homedir } from "node:os";
import { join } from "node:path";

/** Resolves the user home directory (`$HOME` when set). */
export function userHome(): string {
  return process.env.HOME ?? homedir();
}

/** Expands a leading `~` or `~/` in a path using {@link userHome}. */
export function expandTilde(path: string): string {
  if (path.startsWith("~/")) {
    return join(userHome(), path.slice(2));
  }
  if (path === "~") {
    return userHome();
  }
  return path;
}

/** XDG config base directory (`$XDG_CONFIG_HOME` or `~/.config`). */
export function xdgConfigHome(home = userHome()): string {
  return process.env.XDG_CONFIG_HOME ?? join(home, ".config");
}

/** Windows `%APPDATA%` (or `~/AppData/Roaming`). */
export function appDataHome(home = userHome()): string {
  return process.env.APPDATA ?? join(home, "AppData", "Roaming");
}

/** OS-appropriate base directory for app config files. */
export function appConfigHome(home = userHome()): string {
  if (process.platform === "win32") {
    return appDataHome(home);
  }
  return xdgConfigHome(home);
}
