/** Normalizes bare `install` / `install --uninstall` to `--all`. */
export function normalizeInstallRawOpts(raw: Record<string, string>): Record<string, string> {
  const flag = (name: string) => raw[name] === "1";
  const out = { ...raw };

  if (flag("status") || flag("reinstall") || flag("update")) {
    return out;
  }

  const hasInstallTarget =
    flag("all") || flag("app") || flag("completions") || flag("skill") || flag("mcp");
  const hasUninstallTarget =
    flag("all") ||
    flag("app") ||
    flag("completions") ||
    flag("skill") ||
    flag("mcp") ||
    flag("configure");

  if (flag("configure") && !flag("uninstall") && !hasInstallTarget) {
    return out;
  }

  if (flag("uninstall")) {
    if (!hasUninstallTarget) {
      out.all = "1";
    }
    return out;
  }

  if (!hasInstallTarget) {
    out.all = "1";
  }
  return out;
}
