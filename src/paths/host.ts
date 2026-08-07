/*
Shared host path primitives for install, config, and skill modules.
*/

import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";

/**
 * Resolves the user home directory without depending on `$HOME`.
 * This is helpful for when homebrew post-install hooks run with a temporary `$HOME`.
 */
export function userHome(): string {
  const user = process.env.USER ?? process.env.LOGNAME;
  return (
    [process.env.TEST_USER_HOME, user && `/Users/${user}`, user && `/home/${user}`, process.env.USERPROFILE].find(
      (p) => p && existsSync(p),
    ) ?? userInfo().homedir
  );
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

/** Display path using `~/` when under the user home directory. */
export function displayHomePath(absolutePath: string, home = userHome()): string {
  if (home.length > 0 && absolutePath.startsWith(home)) {
    return `~${absolutePath.slice(home.length)}`;
  }
  return absolutePath;
}

/** XDG config base directory (`$XDG_CONFIG_HOME` or `~/.config`). */
export function xdgConfigHome(home = userHome()): string {
  return process.env.XDG_CONFIG_HOME ?? join(home, ".config");
}

/** App config library root (`~/.local/lib`). */
export function appConfigLibHome(home = userHome()): string {
  return join(home, ".local", "lib");
}
