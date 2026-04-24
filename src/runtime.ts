/*
This module runs parsed commands, help, errors, completion, and leaf handlers.
It owns the top-level control flow after parsing, including validation failures,
shell completion dispatch, and leaf handler invocation.

It keeps execution flow out of the public barrel so the exported API stays small and
the runtime responsibilities remain easy to reason about.
*/

import { cliBuiltinCompletionGroup, completionBashScript, completionZshScript } from "./completion.ts";
import { CliContext } from "./context.ts";
import { cliHelpRender } from "./help.ts";
import { parse, postParseValidate } from "./parse.ts";
import { CliCommand } from "./types.ts";
import { cliValidateRoot } from "./validate.ts";

/**
 * Merges the caller's program root with the reserved `completion` subtree.
 */
function cliRootMergedWithBuiltins(root: CliCommand): CliCommand {
  if (root.handler) {
    return root;
  }
  const merged = { ...root } as any;
  merged.commands = [...(root.commands ?? []), cliBuiltinCompletionGroup(root.key)];
  return merged as CliCommand;
}

/**
 * Validates the schema, parses argv, prints help or errors, runs completion or the leaf handler, then exits.
 *
 * @param root The root CliCommand.
 * @param argv Override the default argv (process.argv.slice(2)).
 */
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

  let parseRoot = root;
  let isLeafCompletionIntercept = false;

  // Intercept completion for Leaf roots (since they can't natively have a completion subcommand)
  // but wrap them in a dummy router so that the parser handles `-h` and errors correctly.
  if (root.handler && argv.length >= 1 && argv[0] === "completion") {
    isLeafCompletionIntercept = true;
    parseRoot = {
      key: root.key,
      description: root.description,
      commands: [cliBuiltinCompletionGroup(root.key)],
    } as any;
  } else {
    parseRoot = cliRootMergedWithBuiltins(root);
  }

  let pr = parse(parseRoot, argv);
  pr = postParseValidate(parseRoot, pr);

  if (pr.kind === "help") {
    process.stdout.write(cliHelpRender(parseRoot, pr.helpPath, false));
    process.exit(pr.helpExplicit ? 0 : 1);
  }

  if (pr.kind === "error") {
    const color = process.stderr.isTTY;
    const msg = color ? `\u001B[31m${pr.errorMsg}\u001B[0m` : pr.errorMsg;
    process.stderr.write(msg + "\n");
    process.stderr.write(cliHelpRender(parseRoot, pr.errorHelpPath, true));
    process.exit(1);
  }

  // Leaf roots have an empty path; that's normal.

  if (pr.path[0] === "completion") {
    // If we intercepted a leaf, we MUST pass the original `root` to generate completions
    // because `parseRoot` is just a dummy router!
    const schemaForCompletion = isLeafCompletionIntercept ? root : parseRoot;

    if (pr.path[1] === "bash") {
      process.stdout.write(completionBashScript(schemaForCompletion));
      process.exit(0);
    }
    if (pr.path[1] === "zsh") {
      process.stdout.write(completionZshScript(schemaForCompletion));
      process.exit(0);
    }
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

  const ctx = new CliContext(parseRoot.key, pr.path, pr.args, pr.opts, parseRoot);
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

/**
 * Prints a red error line and contextual help on stderr, then exits with status 1.
 */
export function cliErrWithHelp(ctx: CliContext, msg: string): never {
  const color = process.stderr.isTTY;
  const line = color ? `\u001B[31m${msg}\u001B[0m` : msg;
  process.stderr.write(line + "\n");
  process.stderr.write(cliHelpRender(ctx.schema, ctx.commandPath, true));
  process.exit(1);
}