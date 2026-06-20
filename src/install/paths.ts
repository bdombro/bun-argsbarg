import { homedir } from "node:os";
import { join } from "node:path";
import { CliCommand } from "../types.ts";
import { sanitizeToolSegment } from "../mcp/tools.ts";

export interface InstallPaths {
  bindir: string;
  binaryPath: string;
  bashCompletion: string;
  zshCompletion: string;
  fishCompletion: string;
  cursorSkillDir: string;
  claudeSkillDir: string;
  cursorMcpPath: string;
  claudeMcpPath: string;
  bashRc: string;
  zshRc: string;
  mcpName: string;
  skillDirName: string;
}

/** Resolves the user home directory (`$HOME` when set). */
export function userHome(): string {
  return process.env.HOME ?? homedir();
}

function expandTilde(path: string): string {
  if (path.startsWith("~/")) {
    return join(userHome(), path.slice(2));
  }
  if (path === "~") {
    return userHome();
  }
  return path;
}

/** Resolves the binary install directory from CLI flag, env, or config. */
export function resolveBindir(root: CliCommand, prefix?: string): string {
  const raw = prefix ?? process.env.INSTALL_PREFIX ?? root.install?.prefix;
  if (raw) {
    return expandTilde(raw);
  }
  return join(userHome(), ".local", "bin");
}

/** Resolves all install artifact paths for a program root. */
export function resolveInstallPaths(root: CliCommand, opts: { prefix?: string }): InstallPaths {
  const home = userHome();
  const bindir = resolveBindir(root, opts.prefix);
  const key = root.key;
  const skillDirName = sanitizeToolSegment(root.key);
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(home, ".config");

  return {
    bindir,
    binaryPath: join(bindir, key),
    bashCompletion: join(home, ".bash_completion.d", key),
    zshCompletion: join(home, ".zsh", "completions", `_${key}`),
    fishCompletion: join(xdgConfig, "fish", "completions", `${key}.fish`),
    cursorSkillDir: join(home, ".cursor", "skills", skillDirName),
    claudeSkillDir: join(home, ".claude", "skills", skillDirName),
    cursorMcpPath: join(home, ".cursor", "mcp.json"),
    claudeMcpPath: join(home, ".claude.json"),
    bashRc: join(home, ".bashrc"),
    zshRc: join(home, ".zshrc"),
    mcpName: root.mcpServer?.name ?? root.key,
    skillDirName,
  };
}
