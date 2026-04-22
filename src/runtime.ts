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
  const merged = { ...root };
  merged.commands = [...(root.commands ?? []), cliBuiltinCompletionGroup(root.key)];
  return merged;
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

  const merged = cliRootMergedWithBuiltins(root);
  let pr = parse(merged, argv);
  pr = postParseValidate(merged, pr);

  if (pr.kind === "help") {
    process.stdout.write(cliHelpRender(merged, pr.helpPath, false));
    process.exit(pr.helpExplicit ? 0 : 1);
  }

  if (pr.kind === "error") {
    const color = process.stderr.isTTY;
    const msg = color ? `\u001B[31m${pr.errorMsg}\u001B[0m` : pr.errorMsg;
    process.stderr.write(msg + "\n");
    process.stderr.write(cliHelpRender(merged, pr.errorHelpPath, true));
    process.exit(1);
  }

  if (pr.path.length === 0) {
    process.stderr.write("Internal error: empty path.\n");
    process.exit(1);
  }

  if (pr.path[0] === "completion") {
    if (pr.path[1] === "bash") {
      process.stdout.write(completionBashScript(merged));
      process.exit(0);
    }
    if (pr.path[1] === "zsh") {
      process.stdout.write(completionZshScript(merged));
      process.exit(0);
    }
  }

  let current = merged;
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

  const ctx = new CliContext(merged.key, pr.path, pr.args, pr.opts, merged);
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