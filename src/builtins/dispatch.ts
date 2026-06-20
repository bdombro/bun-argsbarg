import { CliCommand } from "../types.ts";
import { completionBashScript } from "./completion-bash.ts";
import { completionFishScript } from "./completion-fish.ts";
import { completionZshScript } from "./completion-zsh.ts";
import { cliBuiltinInstallCommand } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliBuiltinCompletionGroup as completionGroup } from "./completion-group.ts";
import { cliMcpServeStdio } from "../mcp.ts";
import { cliInstall } from "../install/index.ts";
import { isCompiledExecutable } from "../install/compiled.ts";
import type { ParseResult } from "../parse.ts";
import { ParseKind } from "../parse.ts";

export interface DispatchBuiltinOpts {
  isLeafCompletionIntercept: boolean;
  parseRoot: CliCommand;
}

/**
 * Handles built-in commands after parse.
 */
export async function dispatchBuiltin(
  root: CliCommand,
  pr: ParseResult,
  opts: DispatchBuiltinOpts,
): Promise<void> {
  if (pr.kind !== ParseKind.Ok) {
    return;
  }
  if (pr.path[0] === "completion") {
    const schemaForCompletion = opts.isLeafCompletionIntercept ? root : opts.parseRoot;
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

  if (pr.path[0] === "mcp") {
    if (!root.mcpServer) {
      process.stderr.write("MCP is not enabled. Set mcpServer on the program root.\n");
      process.exit(1);
    }
    if (pr.path.length !== 1) {
      process.stderr.write("Unknown subcommand: mcp " + pr.path.slice(1).join(" ") + "\n");
      process.exit(1);
    }
    await cliMcpServeStdio(root);
    process.exit(0);
  }

  if (pr.path[0] === "install") {
    if (!isCompiledExecutable()) {
      process.stderr.write(
        "install is only available in compiled binaries (bun build --compile).\n",
      );
      process.exit(1);
    }
    if (root.install?.enabled === false) {
      process.stderr.write("install is disabled. Remove install.enabled: false from the program root.\n");
      process.exit(1);
    }
    if (pr.path.length !== 1) {
      process.stderr.write("Unknown subcommand: install " + pr.path.slice(1).join(" ") + "\n");
      process.exit(1);
    }
    await cliInstall(root, pr.opts);
  }
}

/** Built-in intercept roots for leaf programs. */
export function builtinInterceptRoot(
  root: CliCommand,
  argv: string[],
): { parseRoot: CliCommand; isLeafCompletionIntercept: boolean } {
  if (!root.handler || argv.length < 1) {
    return { parseRoot: root, isLeafCompletionIntercept: false };
  }

  const first = argv[0];
  if (first === "completion") {
    return {
      parseRoot: {
        key: root.key,
        description: root.description,
        commands: [completionGroup(root.key)],
      } as CliCommand,
      isLeafCompletionIntercept: true,
    };
  }

  if (first === "install" && isCompiledExecutable() && root.install?.enabled !== false) {
    return {
      parseRoot: {
        key: root.key,
        description: root.description,
        commands: [cliBuiltinInstallCommand(root)],
      } as CliCommand,
      isLeafCompletionIntercept: false,
    };
  }

  if (first === "mcp" && root.mcpServer !== undefined) {
    return {
      parseRoot: {
        key: root.key,
        description: root.description,
        commands: [cliBuiltinMcpCommand()],
      } as CliCommand,
      isLeafCompletionIntercept: false,
    };
  }

  return { parseRoot: root, isLeafCompletionIntercept: false };
}
