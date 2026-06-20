/*
This module validates CLI schemas before execution.
*/

import { reservedCommandNames, resolveCapabilities } from "./capabilities.ts";
import {
  type CliLeaf,
  type CliNode,
  type CliProgram,
  CliOptionKind,
  CliSchemaValidationError,
  isCliLeaf,
  isCliRouter,
} from "./types.ts";
import { resolveMcpSchemaUri } from "./mcp/tools.ts";
import { DOCS_BUILTIN_TOPIC_KEYS } from "./docs/resolve.ts";

/** Validates `docs` configuration on the program root. */
function validateDocsConfig(docs: import("./types.ts").CliDocsConfig): void {
  const keys = Object.keys(docs.topics);
  if (keys.length === 0) {
    throw new CliSchemaValidationError("docs.topics must be non-empty");
  }
  for (const reserved of DOCS_BUILTIN_TOPIC_KEYS) {
    if (reserved in docs.topics) {
      throw new CliSchemaValidationError(
        `docs.topics key '${reserved}' is reserved for the docs built-in`,
      );
    }
  }
  if (docs.defaultTopic !== undefined && !(docs.defaultTopic in docs.topics)) {
    throw new CliSchemaValidationError(
      `docs.defaultTopic '${docs.defaultTopic}' is not a key in docs.topics`,
    );
  }
  for (const key of keys) {
    const text = docs.topics[key]?.text;
    if (text === undefined || text.length === 0) {
      throw new CliSchemaValidationError(`docs.topics['${key}'].text must be non-empty`);
    }
  }
}

/** Validates a program schema. */
export function cliValidateProgram(program: CliProgram): void {
  if (!program.version || program.version.trim().length === 0) {
    throw new CliSchemaValidationError("CliProgram.version is required");
  }

  if (program.mcpServer !== undefined && program.mcpServer.enabled !== true) {
    throw new CliSchemaValidationError(
      "mcpServer requires enabled: true; omit mcpServer to disable MCP",
    );
  }

  if (program.docs !== undefined && program.docs.enabled !== true) {
    throw new CliSchemaValidationError(
      "docs requires enabled: true; omit docs to disable bundled documentation",
    );
  }

  if (program.docs?.enabled === true) {
    validateDocsConfig(program.docs);
  }

  if (program.install?.updateGetLatest !== undefined) {
    if (program.install.enabled === false) {
      throw new CliSchemaValidationError(
        "install.updateGetLatest requires install to be enabled (omit install.enabled: false)",
      );
    }
    if (typeof program.install.updateGetLatest !== "function") {
      throw new CliSchemaValidationError("install.updateGetLatest must be a function");
    }
  }

  const caps = resolveCapabilities(program);
  const reserved = reservedCommandNames(caps);

  if (isCliRouter(program)) {
    for (const child of program.commands) {
      if (reserved.includes(child.key)) {
        throw new CliSchemaValidationError(`Reserved command name: ${child.key}`);
      }
    }
  }

  walkNode(program, program, true);
}

function walkNode(node: CliNode, program: CliProgram, isRoot: boolean): void {
  if (!isRoot) {
    const rogue = node as CliProgram;
    if (rogue.mcpServer !== undefined) {
      throw new CliSchemaValidationError(
        "mcpServer is only supported on the program root (not on " + node.key + ")",
      );
    }
    if (rogue.install !== undefined) {
      throw new CliSchemaValidationError(
        "install is only supported on the program root (not on " + node.key + ")",
      );
    }
    if (rogue.docs !== undefined) {
      throw new CliSchemaValidationError(
        "docs is only supported on the program root (not on " + node.key + ")",
      );
    }
  }

  if (isCliLeaf(node)) {
    if (isRoot && node.mcpTool !== undefined) {
      throw new CliSchemaValidationError("mcpTool is only supported on leaf commands");
    }
  } else {
    const rogue = node as unknown as CliLeaf;
    if (rogue.mcpTool !== undefined) {
      throw new CliSchemaValidationError(
        "mcpTool is only supported on leaf commands (not on " + node.key + ")",
      );
    }
  }

  if (isRoot && program.mcpServer?.enabled === true && program.mcpServer.resources) {
    const schemaUri = resolveMcpSchemaUri(program);
    const uris = program.mcpServer.resources.map((r) => r.uri);
    if (uris.includes(schemaUri)) {
      throw new CliSchemaValidationError(
        `mcpServer.resources URI '${schemaUri}' conflicts with the built-in schema resource`,
      );
    }
    if (new Set(uris).size !== uris.length) {
      throw new CliSchemaValidationError("mcpServer.resources URIs must be unique");
    }
  }

  if (isCliRouter(node)) {
    const seenNames = new Set<string>();
    for (const child of node.commands) {
      if (seenNames.has(child.key)) {
        throw new CliSchemaValidationError(`Duplicate command name: ${child.key}`);
      }
      seenNames.add(child.key);
    }

    if (node.fallbackMode !== undefined && node.fallbackCommand === undefined) {
      throw new CliSchemaValidationError(
        `fallbackMode requires fallbackCommand on '${node.key}'`,
      );
    }

    if (node.fallbackCommand !== undefined) {
      const valid = node.commands.find((c) => c.key === node.fallbackCommand);
      if (!valid) {
        throw new CliSchemaValidationError(
          `fallbackCommand '${node.fallbackCommand}' is not a child of '${node.key}'`,
        );
      }
    }

    for (const child of node.commands) {
      walkNode(child, program, false);
    }
  }

  const positionals = isCliLeaf(node) ? (node.positionals ?? []) : [];
  validateOptions(node.key, node.options ?? []);
  validatePositionals(node.key, positionals);
}

function validateOptions(scopeKey: string, options: import("./types.ts").CliOption[]): void {
  const seenShorts = new Set<string>();
  for (const opt of options) {
    if (opt.required && opt.kind === CliOptionKind.Presence) {
      throw new CliSchemaValidationError(
        `Presence option cannot be required: ${scopeKey}/${opt.name}`,
      );
    }

    if (opt.shortName !== undefined) {
      if (opt.shortName === "h") {
        throw new CliSchemaValidationError(
          `Short alias -h is reserved for help: ${scopeKey}/${opt.name}`,
        );
      }
      if (seenShorts.has(opt.shortName)) {
        throw new CliSchemaValidationError(
          `Duplicate short alias -${opt.shortName} in scope ${scopeKey}`,
        );
      }
      seenShorts.add(opt.shortName);
    }

    if (opt.kind === CliOptionKind.Enum) {
      if (!opt.choices || opt.choices.length === 0) {
        throw new CliSchemaValidationError(
          `Option '${opt.name}' on '${scopeKey}': Enum kind requires non-empty choices`,
        );
      }
      if (new Set(opt.choices).size !== opt.choices.length) {
        throw new CliSchemaValidationError(
          `Option '${opt.name}' on '${scopeKey}': Enum choices must be distinct`,
        );
      }
      for (const choice of opt.choices) {
        if (choice.length === 0) {
          throw new CliSchemaValidationError(
            `Option '${opt.name}' on '${scopeKey}': Enum choices must be non-empty strings`,
          );
        }
      }
    } else if (opt.choices !== undefined) {
      throw new CliSchemaValidationError(
        `Option '${opt.name}' on '${scopeKey}': choices is only valid for Enum kind`,
      );
    }
  }
}

function validatePositionals(scopeKey: string, positionals: import("./types.ts").CliPositional[]): void {
  for (const p of positionals) {
    if (p.argMin !== undefined && p.argMin < 0) {
      throw new CliSchemaValidationError(`argMin must be >= 0 for positional ${scopeKey}/${p.name}`);
    }
    if (p.argMax !== undefined && p.argMax < 0) {
      throw new CliSchemaValidationError(
        `argMax must be >= 0 (use 0 for unlimited) for positional ${scopeKey}/${p.name}`,
      );
    }
    const { argMin = 1, argMax = 1 } = p;
    if (argMax > 0 && argMin > argMax) {
      throw new CliSchemaValidationError(
        `argMin must not exceed argMax for positional ${scopeKey}/${p.name}`,
      );
    }
  }

  let sawOptional = false;
  for (const p of positionals) {
    const { argMin = 1 } = p;
    if (argMin === 0) {
      sawOptional = true;
    } else if (sawOptional) {
      throw new CliSchemaValidationError(`Required positional after optional in scope ${scopeKey}`);
    }
  }

  for (let idx = 0; idx < positionals.length; idx++) {
    const { argMax = 1 } = positionals[idx]!;
    if (argMax === 0 && idx + 1 < positionals.length) {
      throw new CliSchemaValidationError(
        `Unlimited positional (argMax == 0) must be last in scope ${scopeKey}`,
      );
    }
  }
}
