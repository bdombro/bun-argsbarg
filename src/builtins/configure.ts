import { configCommandsEnabled, configMcpSetEnabled } from "../config/entry.ts";
import { cliConfigureInstall, cliConfigureStatus, cliConfigureUninstall } from "../configure/index.ts";
import {
  type AppSpec,
  type CommandGroup,
  type CommandOption,
  OptionKind,
  type RunnableCommand,
} from "../core/types.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";
import { configureConfigSubcommands } from "./config.ts";
import { configureCommandDescription, configureCommandNotes } from "./configure-copy.ts";

const YES_OPTION: CommandOption = {
  name: "yes",
  description: "Skip uninstall confirmation.",
  kind: OptionKind.Presence,
  shortName: "y",
};

const JSON_OPTION: CommandOption = {
  name: "json",
  description: "Print status JSON on stdout.",
  kind: OptionKind.Presence,
};

/** True when argv resolved to `configure get` or `configure set`. */
export function isConfigureConfigPath(path: string[]): boolean {
  return path.length >= 2 && (path[1] === "get" || path[1] === "set");
}

function configureInstallLeaf(program: AppSpec): RunnableCommand {
  return {
    key: "install",
    description: "Install agent artifacts and bootstrap app config.",
    handler: async () => {
      await cliConfigureInstall(program);
    },
  };
}

function configureUninstallLeaf(program: AppSpec): RunnableCommand {
  return {
    key: "uninstall",
    description: "Remove agent artifacts and app config.",
    options: [YES_OPTION],
    handler: async (ctx) => {
      await cliConfigureUninstall(program, { yes: ctx.hasFlag("yes") });
    },
  };
}

function configureStatusLeaf(program: AppSpec): RunnableCommand {
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
export function cliBuiltinConfigureCommand(root: AppSpec): CommandGroup {
  const caps = resolveCapabilities(root);
  const commands: RunnableCommand[] = [
    configureInstallLeaf(root),
    configureUninstallLeaf(root),
    configureStatusLeaf(root),
  ];
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
