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
