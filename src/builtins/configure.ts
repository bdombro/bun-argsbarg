import { resolveCapabilities } from "../capabilities.ts";
import { type CliLeaf, type CliOption, CliOptionKind, type CliProgram } from "../types.ts";
import {
  configureCommandDescription,
  configureCommandNotes,
  configureSyncOptionDescription,
} from "./configure-copy.ts";

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

/** Builds the `configure` built-in command. */
export function cliBuiltinConfigureCommand(root: CliProgram): CliLeaf {
  const caps = resolveCapabilities(root);
  return {
    key: "configure",
    description: configureCommandDescription(root, caps),
    options: configureBuiltinOptions(root),
    notes: configureCommandNotes(root, caps),
    handler: () => {},
  };
}
