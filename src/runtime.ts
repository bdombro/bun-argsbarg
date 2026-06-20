/*
This module runs parsed commands, help, errors, completion, and leaf handlers.
*/

import { resolveCapabilities } from "./capabilities.ts";
import { builtinInterceptRoot, dispatchBuiltin } from "./builtins/dispatch.ts";
import { cliPresentationRoot } from "./builtins/presentation.ts";
import type { CliRouter } from "./types.ts";
import { type CliNode, type CliProgram, isCliLeaf, isCliRouter } from "./types.ts";
import { CliContext } from "./context.ts";
import { cliHelpRender } from "./help.ts";
import { parse, postParseValidate, ParseKind } from "./parse.ts";
import { cliSchemaJson } from "./schema.ts";
import { cliValidateProgram } from "./validate.ts";

function cliRootMergedWithBuiltins(program: CliProgram): CliRouter {
  return cliPresentationRoot(program);
}

export async function cliRun(program: CliProgram, argv: string[] = process.argv.slice(2)): Promise<never> {
  try {
    cliValidateProgram(program);
  } catch (err) {
    if (err instanceof Error) {
      process.stderr.write(err.message + "\n");
    } else {
      process.stderr.write("Invalid CLI definition.\n");
    }
    process.exit(1);
  }

  const caps = resolveCapabilities(program);

  if (argv.length >= 1 && argv[0] === "mcp" && !caps.mcp) {
    process.stderr.write("MCP is not enabled. Set mcpServer: { enabled: true } on the program root.\n");
    process.exit(1);
  }

  if (argv.length >= 1 && argv[0] === "install" && !caps.install) {
    process.stderr.write("install is disabled. Remove install.enabled: false from the program root.\n");
    process.exit(1);
  }

  let parseRoot: CliNode;
  let completionParseRoot: CliRouter = cliRootMergedWithBuiltins(program);
  let isLeafCompletionIntercept = false;

  if (isCliLeaf(program)) {
    const intercept = builtinInterceptRoot(program, argv);
    if (intercept.isLeafCompletionIntercept || intercept.parseRoot !== program) {
      parseRoot = intercept.parseRoot;
      completionParseRoot = isCliRouter(intercept.parseRoot)
        ? intercept.parseRoot
        : cliRootMergedWithBuiltins(program);
      isLeafCompletionIntercept = intercept.isLeafCompletionIntercept;
    } else {
      parseRoot = program;
    }
  } else {
    parseRoot = cliRootMergedWithBuiltins(program);
  }

  let pr = parse(parseRoot, argv);
  pr = postParseValidate(parseRoot, pr);

  if (pr.kind === ParseKind.Help) {
    process.stdout.write(cliHelpRender(cliPresentationRoot(program), pr.helpPath, false));
    process.exit(pr.helpExplicit ? 0 : 1);
  }

  if (pr.kind === ParseKind.Schema) {
    process.stdout.write(cliSchemaJson(program));
    process.exit(0);
  }

  if (pr.kind === "error") {
    const color = process.stderr.isTTY;
    const msg = color ? `\u001B[31m${pr.errorMsg}\u001B[0m` : pr.errorMsg;
    process.stderr.write(msg + "\n");
    process.stderr.write(cliHelpRender(cliPresentationRoot(program), pr.errorHelpPath, true));
    process.exit(1);
  }

  if (pr.kind === ParseKind.Ok) {
    await dispatchBuiltin(program, pr, { isLeafCompletionIntercept, parseRoot: completionParseRoot });
  }

  let current: CliNode = parseRoot;
  for (const seg of pr.path) {
    if (!isCliRouter(current)) {
      process.stderr.write("Internal error: missing handler for path.\n");
      process.exit(1);
    }
    const ch = current.commands.find((candidate) => candidate.key === seg);
    if (!ch) {
      process.stderr.write("Internal error: missing handler for path.\n");
      process.exit(1);
    }
    current = ch;
  }

  if (!isCliLeaf(current) || !current.handler) {
    process.stderr.write("Internal error: missing handler for path.\n");
    process.exit(1);
  }

  const ctx = new CliContext(program.key, pr.path, pr.args, pr.opts, program, "cli");
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
  process.stderr.write(cliHelpRender(cliPresentationRoot(ctx.program), ctx.commandPath, true));
  process.exit(1);
}
