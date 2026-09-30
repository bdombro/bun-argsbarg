import type { ParseResult } from "../core/parse.ts";
import { ParseKind } from "../core/parse.ts";
import type { AppSpec, Command, CommandGroup } from "../core/types.ts";
import { hasHandler } from "../core/types.ts";
import { runMcpBundle } from "../mcp/pack/bundle.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";
import { App } from "../runtime/cli.ts";
import { serveOverridesFromOpts } from "../server/overrides.ts";
import { completionBashScript } from "./completion/bash.ts";
import { completionFishScript } from "./completion/fish.ts";
import { cliBuiltinCompletionGroup as completionGroup } from "./completion/group.ts";
import { completionZshScript } from "./completion/zsh.ts";
import { cliBuiltinHttpCommand } from "./http.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliPresentationRoot } from "./presentation.ts";
import { cliBuiltinVersionCommand } from "./registry.ts";

export interface DispatchBuiltinOpts {
  isLeafCompletionIntercept: boolean;
  parseRoot: CommandGroup;
}

function completionSchema(program: AppSpec, opts: DispatchBuiltinOpts): CommandGroup {
  if (opts.isLeafCompletionIntercept) {
    return cliPresentationRoot(program);
  }
  return opts.parseRoot;
}

/**
 * Handles built-in commands after parse.
 */
export async function dispatchBuiltin(program: AppSpec, pr: ParseResult, opts: DispatchBuiltinOpts): Promise<void> {
  if (pr.kind !== ParseKind.Ok) {
    return;
  }

  const caps = resolveCapabilities(program);

  // With the capability off, `completion` is an ordinary name (the app's own command, if any).
  if (pr.path[0] === "completion" && caps.completion) {
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

  // With the capability off, `http` is an ordinary name (the app's own command, if any).
  if (pr.path[0] === "http" && caps.http) {
    const sub = pr.path[1];
    if (pr.path.length === 1 || sub === "serve") {
      await new App(program).serveHttp(serveOverridesFromOpts(pr.opts, "http"));
      process.exit(0);
    }
    process.stderr.write(`Unknown subcommand: http ${pr.path.slice(1).join(" ")}\n`);
    process.exit(1);
  }

  // With the capability off, `mcp` is an ordinary name (the app's own command, if any).
  if (pr.path[0] === "mcp" && caps.mcp) {
    const sub = pr.path[1];
    if (pr.path.length === 1 || sub === "serve") {
      await new App(program).serveMcp(serveOverridesFromOpts(pr.opts, "mcp"));
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
}

/** Built-in intercept roots for leaf programs. */
export function builtinInterceptRoot(
  program: AppSpec,
  argv: string[],
): { parseRoot: Command; isLeafCompletionIntercept: boolean } {
  if (!hasHandler(program) || argv.length < 1) {
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

  return { parseRoot: program, isLeafCompletionIntercept: false };
}
