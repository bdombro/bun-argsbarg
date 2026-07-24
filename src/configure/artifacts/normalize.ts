/** Normalizes bare `install` to `--all`. */
export function normalizeInstallRawOpts(raw: Record<string, string>): Record<string, string> {
  const flag = (name: string) => raw[name] === "1";
  const out = { ...raw };

  if (flag("status") || flag("reinstall")) {
    return out;
  }

  const hasInstallTarget = flag("all") || flag("skill") || flag("mcp");

  if (flag("configure") && !hasInstallTarget) {
    return out;
  }

  if (!hasInstallTarget) {
    out.all = "1";
  }
  return out;
}
