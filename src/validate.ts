/*
This module validates CLI schemas before execution.
*/

import {
  CliCommand,
  CliFallbackMode,
  CliOptionKind,
  CliSchemaValidationError,
} from "./types.ts";
import { MCP_SCHEMA_URI_DEFAULT } from "./mcp/tools.ts";

function reservedCommandNames(root: CliCommand): string[] {
  const names = ["completion", "install"];
  if (root.mcpServer !== undefined) {
    names.push("mcp");
  }
  return names;
}

export function cliValidateRoot(root: CliCommand): void {
  for (const child of root.commands ?? []) {
    if (reservedCommandNames(root).includes(child.key)) {
      throw new CliSchemaValidationError(`Reserved command name: ${child.key}`);
    }
  }

  walkCommand(root, true);
}

function walkCommand(cmd: CliCommand, isRoot: boolean = false): void {
  if (!isRoot && cmd.mcpServer !== undefined) {
    throw new CliSchemaValidationError(
      "mcpServer is only supported on the program root (not on " + cmd.key + ")",
    );
  }

  if (!isRoot && cmd.install !== undefined) {
    throw new CliSchemaValidationError(
      "install is only supported on the program root (not on " + cmd.key + ")",
    );
  }

  const isLeaf = "handler" in cmd && !!cmd.handler;
  if (!isLeaf && cmd.mcpTool !== undefined) {
    throw new CliSchemaValidationError(
      "mcpTool is only supported on leaf commands (not on " + cmd.key + ")",
    );
  }
  if (isRoot && cmd.mcpTool !== undefined) {
    throw new CliSchemaValidationError("mcpTool is only supported on leaf commands");
  }

  if (isRoot && cmd.mcpServer?.resources) {
    const schemaUri = cmd.mcpServer.schemaResourceUri ?? MCP_SCHEMA_URI_DEFAULT;
    const uris = cmd.mcpServer.resources.map((r) => r.uri);
    if (uris.includes(schemaUri)) {
      throw new CliSchemaValidationError(
        `mcpServer.resources URI '${schemaUri}' conflicts with the built-in schema resource`,
      );
    }
    if (new Set(uris).size !== uris.length) {
      throw new CliSchemaValidationError("mcpServer.resources URIs must be unique");
    }
  }

  const seenNames = new Set<string>();
  for (const child of cmd.commands ?? []) {
    if (seenNames.has(child.key)) {
      throw new CliSchemaValidationError(`Duplicate command name: ${child.key}`);
    }
    seenNames.add(child.key);
  }

  if (cmd.fallbackMode !== undefined && cmd.fallbackCommand === undefined) {
    throw new CliSchemaValidationError(
      `fallbackMode requires fallbackCommand on '${cmd.key}'`,
    );
  }

  if (cmd.fallbackCommand !== undefined) {
    const children = cmd.commands ?? [];
    const valid = children.find((c) => c.key === cmd.fallbackCommand);
    if (!valid) {
      throw new CliSchemaValidationError(
        `fallbackCommand '${cmd.fallbackCommand}' is not a child of '${cmd.key}'`,
      );
    }
  }

  const seenShorts = new Set<string>();
  for (const opt of cmd.options ?? []) {
    if (opt.required && opt.kind === CliOptionKind.Presence) {
      throw new CliSchemaValidationError(
        `Presence option cannot be required: ${cmd.key}/${opt.name}`,
      );
    }

    if (opt.name === "schema") {
      throw new CliSchemaValidationError(
        `Option name "schema" is reserved for --schema: ${cmd.key}/${opt.name}`,
      );
    }

    if (opt.shortName !== undefined) {
      if (opt.shortName === "h") {
        throw new CliSchemaValidationError(
          `Short alias -h is reserved for help: ${cmd.key}/${opt.name}`,
        );
      }
      if (seenShorts.has(opt.shortName)) {
        throw new CliSchemaValidationError(
          `Duplicate short alias -${opt.shortName} in scope ${cmd.key}`,
        );
      }
      seenShorts.add(opt.shortName);
    }

    if (opt.kind === CliOptionKind.Enum) {
      if (!opt.choices || opt.choices.length === 0) {
        throw new CliSchemaValidationError(
          `Option '${opt.name}' on '${cmd.key}': Enum kind requires non-empty choices`,
        );
      }
      if (new Set(opt.choices).size !== opt.choices.length) {
        throw new CliSchemaValidationError(
          `Option '${opt.name}' on '${cmd.key}': Enum choices must be distinct`,
        );
      }
      for (const choice of opt.choices) {
        if (choice.length === 0) {
          throw new CliSchemaValidationError(
            `Option '${opt.name}' on '${cmd.key}': Enum choices must be non-empty strings`,
          );
        }
      }
    } else if (opt.choices !== undefined) {
      throw new CliSchemaValidationError(
        `Option '${opt.name}' on '${cmd.key}': choices is only valid for Enum kind`,
      );
    }
  }

  const positionals = cmd.positionals ?? [];
  for (const p of positionals) {
    if (p.argMin !== undefined && p.argMin < 0) {
      throw new CliSchemaValidationError(`argMin must be >= 0 for positional ${cmd.key}/${p.name}`);
    }
    if (p.argMax !== undefined && p.argMax < 0) {
      throw new CliSchemaValidationError(
        `argMax must be >= 0 (use 0 for unlimited) for positional ${cmd.key}/${p.name}`,
      );
    }
    const { argMin = 1, argMax = 1 } = p;
    if (argMax > 0 && argMin > argMax) {
      throw new CliSchemaValidationError(
        `argMin must not exceed argMax for positional ${cmd.key}/${p.name}`,
      );
    }
  }

  let sawOptional = false;
  for (const p of positionals) {
    const { argMin = 1 } = p;
    if (argMin === 0) {
      sawOptional = true;
    } else if (sawOptional) {
      throw new CliSchemaValidationError(`Required positional after optional in scope ${cmd.key}`);
    }
  }

  for (let idx = 0; idx < positionals.length; idx++) {
    const { argMax = 1 } = positionals[idx]!;
    if (argMax === 0 && idx + 1 < positionals.length) {
      throw new CliSchemaValidationError(
        `Unlimited positional (argMax == 0) must be last in scope ${cmd.key}`,
      );
    }
  }

  for (const child of cmd.commands ?? []) {
    walkCommand(child, false);
  }
}
