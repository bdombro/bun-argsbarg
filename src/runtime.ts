/*
This module runs parsed commands, help, errors, completion, and leaf handlers.
*/

import { builtinInterceptRoot, dispatchBuiltin } from "./builtins/dispatch.ts";
import { cliPresentationRoot } from "./builtins/presentation.ts";
import { isCompiledExecutable } from "./install/compiled.ts";
import { CliContext } from "./context.ts";
import { cliHelpRender } from "./help.ts";
import { parse, postParseValidate, ParseKind } from "./parse.ts";
import { cliSchemaJson } from "./schema.ts";
import { CliCommand } from "./types.ts";
import { cliValidateRoot } from "./validate.ts";

function cliRootMergedWithBuiltins(root: CliCommand): CliCommand {
  if (root.handler) {
    return root;
  }
  return cliPresentationRoot(root);
}

export async function cliRun(root: CliCommand, argv: string[] = process.argv.slice(2)): Promise<never> {
  try {
    cliValidateRoot(root);
  } catch (err) {
    if (err instanceof Error) {
      process.stderr.write(err.message + "\n");
    } else {
      process.stderr.write("Invalid CLI definition.\n");
    }
    process.exit(1);
  }

  if (argv.length >= 1 && argv[0] === "mcp" && !root.mcpServer) {
    process.stderr.write("MCP is not enabled. Set mcpServer on the program root.\n");
    process.exit(1);
  }

  if (argv.length >= 1 && argv[0] === "install" && !isCompiledExecutable()) {
    process.stderr.write("install is only available in compiled binaries (bun build --compile).\n");
    process.exit(1);
  }

  let parseRoot: CliCommand;
  let isLeafCompletionIntercept = false;

  if (root.handler) {
    const intercept = builtinInterceptRoot(root, argv);
    if (intercept.isLeafCompletionIntercept || intercept.parseRoot !== root) {
      parseRoot = intercept.parseRoot;
      isLeafCompletionIntercept = intercept.isLeafCompletionIntercept;
    } else {
      parseRoot = root;
    }
  } else {
    parseRoot = cliRootMergedWithBuiltins(root);
  }

  let pr = parse(parseRoot, argv);
  pr = postParseValidate(parseRoot, pr);

  if (pr.kind === ParseKind.Help) {
    process.stdout.write(cliHelpRender(cliPresentationRoot(root), pr.helpPath, false));
    process.exit(pr.helpExplicit ? 0 : 1);
  }

  if (pr.kind === ParseKind.Schema) {
    process.stdout.write(cliSchemaJson(root));
    process.exit(0);
  }

  if (pr.kind === "error") {
    const color = process.stderr.isTTY;
    const msg = color ? `\u001B[31m${pr.errorMsg}\u001B[0m` : pr.errorMsg;
    process.stderr.write(msg + "\n");
    process.stderr.write(cliHelpRender(cliPresentationRoot(root), pr.errorHelpPath, true));
    process.exit(1);
  }

  if (pr.kind === ParseKind.Ok) {
    await dispatchBuiltin(root, pr, { isLeafCompletionIntercept, parseRoot });
  }

  let current = parseRoot;
  for (const seg of pr.path) {
    const ch = (current.commands ?? []).find((candidate: CliCommand) => candidate.key === seg);
    if (!ch) {
      process.stderr.write("Internal error: missing handler for path.\n");
      process.exit(1);
    }
    current = ch;
  }

  if (!current.handler) {
    process.stderr.write("Internal error: missing handler for path.\n");
    process.exit(1);
  }

  const ctx = new CliContext(parseRoot.key, pr.path, pr.args, pr.opts, parseRoot, "cli");
  try {
    await Promise.resolve(current.handler(ctx));
    process.exit(0);
  } catch (err) {
    if (err instanceof Error) {
      process.stderr.write(err.message + "\n");
    }
    process.exit(1);
  }
}

export function cliErrWithHelp(ctx: CliContext, msg: string): never {
  const color = process.stderr.isTTY;
  const line = color ? `\u001B[31m${msg}\u001B[0m` : msg;
  process.stderr.write(line + "\n");
  process.stderr.write(cliHelpRender(cliPresentationRoot(ctx.schema), ctx.commandPath, true));
  process.exit(1);
}
