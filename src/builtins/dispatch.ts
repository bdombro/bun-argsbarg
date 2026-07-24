import { cliConfigure } from "../configure/index.ts";
import type { ParseResult } from "../core/parse.ts";
import { ParseKind } from "../core/parse.ts";
import type { CliNode, CliProgram, CliRouter } from "../core/types.ts";
import { isCliLeaf } from "../core/types.ts";
import { cliBuiltinDocsGroupIfEnabled } from "../docs/builtin.ts";
import { runMcpBundle } from "../mcp/bundle.ts";
import { capabilityDeniedMessage, resolveCapabilities } from "../runtime/capabilities.ts";
import { Cli } from "../runtime/cli.ts";
import { serveOverridesFromOpts } from "../server/overrides.ts";
import { completionBashScript } from "./completion-bash.ts";
import { completionFishScript } from "./completion-fish.ts";
import { cliBuiltinCompletionGroup as completionGroup } from "./completion-group.ts";
import { completionZshScript } from "./completion-zsh.ts";
import { CONFIGURE_RUN_KEY, cliBuiltinConfigureCommand, isConfigureConfigPath } from "./configure.ts";
import { cliBuiltinHttpCommand } from "./http.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliPresentationRoot } from "./presentation.ts";
import { cliBuiltinVersionCommand } from "./version.ts";

export interface DispatchBuiltinOpts {
  isLeafCompletionIntercept: boolean;
  parseRoot: CliRouter;
}

function completionSchema(program: CliProgram, opts: DispatchBuiltinOpts): CliRouter {
  if (opts.isLeafCompletionIntercept) {
    return cliPresentationRoot(program);
  }
  return opts.parseRoot;
}

/**
 * Handles built-in commands after parse.
 */
export async function dispatchBuiltin(program: CliProgram, pr: ParseResult, opts: DispatchBuiltinOpts): Promise<void> {
  if (pr.kind !== ParseKind.Ok) {
    return;
  }

  const caps = resolveCapabilities(program);

  if (pr.path[0] === "completion") {
    if (!caps.completion) {
      process.stderr.write(capabilityDeniedMessage("completion"));
      process.exit(1);
    }
    const schemaForCompletion = completionSchema(program, opts);
    if (pr.path[1] === "bash") {
      process.stdout.write(completionBashScript(schemaForCompletion));
      process.exit(0);
    }
    if (pr.path[1] === "zsh") {
      process.stdout.write(completionZshScript(schemaForCompletion));
      process.exit(0);
    }
    if (pr.path[1] === "fish") {
      process.stdout.write(completionFishScript(schemaForCompletion));
      process.exit(0);
    }
    return;
  }

  if (pr.path[0] === "version") {
    if (pr.path.length !== 1) {
      process.stderr.write(`Unknown subcommand: version ${pr.path.slice(1).join(" ")}\n`);
      process.exit(1);
    }
    process.stdout.write(`${program.version}\n`);
    process.exit(0);
  }

  if (pr.path[0] === "http") {
    if (!caps.http) {
      process.stderr.write(capabilityDeniedMessage("http"));
      process.exit(1);
    }
    const sub = pr.path[1];
    if (pr.path.length === 1 || sub === "serve") {
      await new Cli(program).serveHttp(serveOverridesFromOpts(pr.opts, "http"));
      process.exit(0);
    }
    process.stderr.write(`Unknown subcommand: http ${pr.path.slice(1).join(" ")}\n`);
    process.exit(1);
  }

  if (pr.path[0] === "mcp") {
    if (!caps.mcp) {
      process.stderr.write(capabilityDeniedMessage("mcp"));
      process.exit(1);
    }
    const sub = pr.path[1];
    if (pr.path.length === 1 || sub === "serve") {
      await new Cli(program).serveMcp(serveOverridesFromOpts(pr.opts, "mcp"));
      process.exit(0);
    }
    if (pr.path.length === 2 && sub === "bundle") {
      try {
        runMcpBundle(program);
      } catch (err) {
        process.stderr.write(err instanceof Error ? `${err.message}\n` : "mcp bundle failed.\n");
        process.exit(1);
      }
      process.exit(0);
    }
    process.stderr.write(`Unknown subcommand: mcp ${pr.path.slice(1).join(" ")}\n`);
    process.exit(1);
  }

  if (pr.path[0] === "configure") {
    if (!caps.configure) {
      process.stderr.write(capabilityDeniedMessage("configure"));
      process.exit(1);
    }
    if (isConfigureConfigPath(pr.path)) {
      return;
    }
    const runSeg = pr.path[1];
    if (pr.path.length > 2 || (pr.path.length === 2 && runSeg !== CONFIGURE_RUN_KEY)) {
      process.stderr.write(`Unknown subcommand: configure ${pr.path.slice(1).join(" ")}\n`);
      process.exit(1);
    }
    await cliConfigure(program, pr.opts);
  }
}

/** Built-in intercept roots for leaf programs. */
export function builtinInterceptRoot(
  program: CliProgram,
  argv: string[],
): { parseRoot: CliNode; isLeafCompletionIntercept: boolean } {
  if (!isCliLeaf(program) || argv.length < 1) {
    return { parseRoot: program, isLeafCompletionIntercept: false };
  }

  const caps = resolveCapabilities(program);
  const first = argv[0];

  if (first === "completion") {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [completionGroup(program)],
      },
      isLeafCompletionIntercept: true,
    };
  }

  if (first === "configure" && caps.configure) {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinConfigureCommand(program)],
      },
      isLeafCompletionIntercept: false,
    };
  }

  if (first === "http" && caps.http) {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinHttpCommand(program)],
      },
      isLeafCompletionIntercept: false,
    };
  }

  if (first === "mcp" && caps.mcp) {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinMcpCommand(program)],
      },
      isLeafCompletionIntercept: false,
    };
  }

  if (first === "version") {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [cliBuiltinVersionCommand()],
      },
      isLeafCompletionIntercept: false,
    };
  }

  const docsGroup = cliBuiltinDocsGroupIfEnabled(program);
  if (first === "docs" && docsGroup) {
    return {
      parseRoot: {
        key: program.key,
        description: program.description,
        commands: [docsGroup],
      },
      isLeafCompletionIntercept: false,
    };
  }

  return { parseRoot: program, isLeafCompletionIntercept: false };
}
