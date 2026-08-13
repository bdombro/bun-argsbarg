import { configCommandsEnabled, configMcpSetEnabled } from "../config/entry.ts";
import { cliConfigureInstall, cliConfigureStatus, cliConfigureUninstall } from "../configure/index.ts";
import { type CliLeaf, type CliOption, CliOptionKind, type CliProgram, type CliRouter } from "../core/types.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";
import { configureConfigSubcommands } from "./config.ts";
import { configureCommandDescription, configureCommandNotes } from "./configure-copy.ts";

const YES_OPTION: CliOption = {
  name: "yes",
  description: "Skip uninstall confirmation.",
  kind: CliOptionKind.Presence,
  shortName: "y",
};

const JSON_OPTION: CliOption = {
  name: "json",
  description: "Print status JSON on stdout.",
  kind: CliOptionKind.Presence,
};

/** True when argv resolved to `configure get` or `configure set`. */
export function isConfigureConfigPath(path: string[]): boolean {
  return path.length >= 2 && (path[1] === "get" || path[1] === "set");
}

function configureInstallLeaf(program: CliProgram): CliLeaf {
  return {
    key: "install",
    description: "Install agent artifacts and bootstrap app config.",
    handler: async () => {
      await cliConfigureInstall(program);
    },
  };
}

function configureUninstallLeaf(program: CliProgram): CliLeaf {
  return {
    key: "uninstall",
    description: "Remove agent artifacts and app config.",
    options: [YES_OPTION],
    handler: async (ctx) => {
      await cliConfigureUninstall(program, { yes: ctx.hasFlag("yes") });
    },
  };
}

function configureStatusLeaf(program: CliProgram): CliLeaf {
  return {
    key: "status",
    description: "Print what is currently installed (read-only).",
    options: [JSON_OPTION],
    handler: (ctx) => {
      cliConfigureStatus(program, { json: ctx.hasFlag("json") });
    },
  };
}

/** Builds the `configure` built-in router. */
export function cliBuiltinConfigureCommand(root: CliProgram): CliRouter {
  const caps = resolveCapabilities(root);
  const commands: CliLeaf[] = [configureInstallLeaf(root), configureUninstallLeaf(root), configureStatusLeaf(root)];
  if (configCommandsEnabled(root)) {
    commands.push(...configureConfigSubcommands(root, configMcpSetEnabled(root)));
  }

  return {
    key: "configure",
    description: configureCommandDescription(root, caps),
    notes: configureCommandNotes(root, caps),
    commands,
  };
}
