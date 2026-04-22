/*
This module validates CLI schemas before execution.
It checks reserved command names, handler placement, fallback rules, duplicate names,
and positional ordering before the runtime starts.

It fails early on structural problems so invalid trees never reach parsing or dispatch.
*/

import {
  CliCommand,
  CliFallbackMode,
  CliSchemaValidationError,
} from "./types.ts";

const reservedCommandNames = ["completion"];

/**
 * Validates the static CliCommand tree against ArgBarg rules.
 * Throws CliSchemaValidationError if rules are violated.
 */
export function cliValidateRoot(root: CliCommand): void {
  // Root-level rules
  if (root.handler !== undefined) {
    throw new CliSchemaValidationError("Program root must not set handler");
  }
  if ((root.positionals ?? []).length > 0) {
    throw new CliSchemaValidationError("Program root must not declare positionals");
  }

  // Check for reserved command names at root
  for (const child of root.commands ?? []) {
    if (reservedCommandNames.includes(child.key)) {
      throw new CliSchemaValidationError(`Reserved command name: ${child.key}`);
    }
  }

  // Recursively validate
  walkCommand(root, true);
}

/** Recursively validates a command node: handlers vs children, options, and positionals. */
function walkCommand(cmd: CliCommand, isRoot: boolean = false): void {
  // Fallback only on root
  if (!isRoot && cmd.fallbackCommand !== undefined) {
    throw new CliSchemaValidationError(
      "Fallback is only supported on the program root (not on " + cmd.key + ")",
    );
  }
  if (
    !isRoot &&
    cmd.fallbackMode !== undefined &&
    cmd.fallbackMode !== CliFallbackMode.MissingOnly
  ) {
    throw new CliSchemaValidationError(
      "fallbackMode may only be set on the program root (not on " + cmd.key + ")",
    );
  }

  if ((cmd.commands ?? []).length > 0) {
    if (cmd.handler !== undefined) {
      throw new CliSchemaValidationError(`Routing command must not set handler: ${cmd.key}`);
    }
  } else {
    if (cmd.handler === undefined) {
      throw new CliSchemaValidationError(`Leaf command requires handler: ${cmd.key}`);
    }
  }

  // Check for duplicate child names
  const seenNames = new Set<string>();
  for (const child of cmd.commands ?? []) {
    if (seenNames.has(child.key)) {
      throw new CliSchemaValidationError(`Duplicate command name: ${child.key}`);
    }
    seenNames.add(child.key);
  }

  // Validate options (short name uniqueness, reserved -h)
  const seenShorts = new Set<string>();
  for (const opt of cmd.options ?? []) {
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
  }

  // Validate positionals
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

  // Check positional ordering: required before optional
  let sawOptional = false;
  for (const p of positionals) {
    const { argMin = 1 } = p;
    if (argMin === 0) {
      sawOptional = true;
    } else if (sawOptional) {
      throw new CliSchemaValidationError(`Required positional after optional in scope ${cmd.key}`);
    }
  }

  // Check unlimited positional must be last
  for (let idx = 0; idx < positionals.length; idx++) {
    const { argMax = 1 } = positionals[idx]!;
    if (argMax === 0 && idx + 1 < positionals.length) {
      throw new CliSchemaValidationError(
        `Unlimited positional (argMax == 0) must be last in scope ${cmd.key}`,
      );
    }
  }

  // Recurse into nested commands
  for (const child of cmd.commands ?? []) {
    walkCommand(child, false);
  }
}
