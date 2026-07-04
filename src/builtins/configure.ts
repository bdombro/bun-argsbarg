import { resolveCapabilities } from "../capabilities.ts";
import { configCommandsEnabled, configMcpSetEnabled } from "../config/entry.ts";
import {
  CliFallbackMode,
  type CliLeaf,
  type CliOption,
  CliOptionKind,
  type CliProgram,
  type CliRouter,
} from "../types.ts";
import { configureConfigSubcommands } from "./config.ts";
import {
  configureCommandDescription,
  configureCommandNotes,
  configureSyncOptionDescription,
} from "./configure-copy.ts";

/** Hidden fallback leaf for bare `configure` (interactive / flag modes). */
export const CONFIGURE_RUN_KEY = "run";

/** Configure command options. */
export function configureBuiltinOptions(root: CliProgram): CliOption[] {
  const caps = resolveCapabilities(root);
  const opts: CliOption[] = [
    {
      name: "sync",
      description: configureSyncOptionDescription(root, caps),
      kind: CliOptionKind.Presence,
    },
    {
      name: "remove-all",
      description: "Remove all detected agent artifacts (skills and MCP).",
      kind: CliOptionKind.Presence,
    },
  ];

  if (root.appConfig) {
    opts.push({
      name: "remove-config",
      description: "Remove the app config file only.",
      kind: CliOptionKind.Presence,
    });
  }

  opts.push(
    {
      name: "status",
      description: "Print what is currently installed (read-only).",
      kind: CliOptionKind.Presence,
    },
    {
      name: "yes",
      description: "Skip confirmation (required for --sync, --remove-all, --remove-config).",
      kind: CliOptionKind.Presence,
      shortName: "y",
    },
    {
      name: "dry",
      description: "Show what would change without writing files.",
      kind: CliOptionKind.Presence,
    },
    {
      name: "json",
      description: "Print changed paths or status JSON on stdout.",
      kind: CliOptionKind.Presence,
    },
  );

  return opts;
}

/** True when argv resolved to `configure get` or `configure set`. */
export function isConfigureConfigPath(path: string[]): boolean {
  return path.length >= 2 && (path[1] === "get" || path[1] === "set");
}

/** Builds the `configure` built-in router. */
export function cliBuiltinConfigureCommand(root: CliProgram): CliRouter {
  const caps = resolveCapabilities(root);
  const run: CliLeaf = {
    key: CONFIGURE_RUN_KEY,
    hidden: true,
    description: "Interactive or flag-driven configure (skills, MCP, app config).",
    handler: () => {},
  };

  const commands: CliLeaf[] = [run];
  if (configCommandsEnabled(root)) {
    commands.push(...configureConfigSubcommands(root, configMcpSetEnabled(root)));
  }

  return {
    key: "configure",
    description: configureCommandDescription(root, caps),
    options: configureBuiltinOptions(root),
    notes: configureCommandNotes(root, caps),
    fallbackCommand: CONFIGURE_RUN_KEY,
    fallbackMode: CliFallbackMode.MissingOnly,
    commands,
  };
}
