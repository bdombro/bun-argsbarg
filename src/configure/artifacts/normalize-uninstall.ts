/** Normalizes bare `uninstall` to `--all`. */
export function normalizeUninstallRawOpts(raw: Record<string, string>): Record<string, string> {
  const flag = (name: string) => raw[name] === "1";
  const out: Record<string, string> = { ...raw, uninstall: "1" };

  const hasUninstallTarget = flag("all") || flag("skill") || flag("mcp") || flag("configure");
  if (!hasUninstallTarget) {
    out.all = "1";
  }
  return out;
}
