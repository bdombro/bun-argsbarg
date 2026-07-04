import type { InstallOpts } from "./target-types.ts";

export function parseInstallOpts(raw: Record<string, string>): InstallOpts {
  const flag = (name: string) => raw[name] === "1";
  return {
    all: flag("all"),
    skill: flag("skill"),
    mcp: flag("mcp"),
    reinstall: flag("reinstall"),
    status: flag("status"),
    uninstall: flag("uninstall"),
    configure: flag("configure"),
    yes: flag("yes"),
    dry: flag("dry"),
    json: flag("json"),
  };
}
