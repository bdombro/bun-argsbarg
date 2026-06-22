export interface ShellDetection {
  bash: boolean;
  zsh: boolean;
  fish: boolean;
}

/** Detects which shells are available on PATH. */
export function detectShells(): ShellDetection {
  return {
    bash: Bun.which("bash") !== null,
    zsh: Bun.which("zsh") !== null,
    fish: Bun.which("fish") !== null,
  };
}

export function rcMarkerStart(appKey: string, tag: string): string {
  return `# ${appKey}:${tag}`;
}

export function rcMarkerEnd(appKey: string, tag: string): string {
  return `# end ${appKey}:${tag}`;
}

/** Returns rc snippet block for PATH, or null if already present. */
export function buildPathRcBlock(appKey: string, bindir: string): string {
  const start = rcMarkerStart(appKey, "path");
  const end = rcMarkerEnd(appKey, "path");
  return [start, `export PATH="${bindir}:$PATH"`, end].join("\n");
}

/** Returns rc snippet block for zsh fpath, or null if already present. */
export function buildZshFpathRcBlock(appKey: string, completionsDir: string): string {
  const start = rcMarkerStart(appKey, "fpath");
  const end = rcMarkerEnd(appKey, "fpath");
  return [start, `fpath=(${completionsDir} $fpath)`, end].join("\n");
}

/** Removes a marker-delimited block from rc file content. */
export function removeRcBlock(content: string, appKey: string, tag: string): string {
  const start = rcMarkerStart(appKey, tag);
  const end = rcMarkerEnd(appKey, tag);
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "g");
  return content.replace(re, "");
}

/** Returns true when the marker block already exists in content. */
export function hasRcBlock(content: string, appKey: string, tag: string): boolean {
  return content.includes(rcMarkerStart(appKey, tag));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
