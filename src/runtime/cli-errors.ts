/*
Handler error helper with contextual help.
*/

import { cliPresentationRoot } from "../builtins/presentation.ts";
import type { CommandContext } from "../core/context.ts";
import { cliHelpRender } from "../help.ts";

export function cliErrWithHelp(ctx: CommandContext, msg: string): never {
  if (ctx.invocation === "http" || ctx.invocation === "mcp") {
    throw new Error(msg);
  }
  const color = process.stderr.isTTY;
  const line = color ? `\u001B[31m${msg}\u001B[0m` : msg;
  process.stderr.write(`${line}\n`);
  process.stderr.write(cliHelpRender(cliPresentationRoot(ctx.spec), ctx.commandPath, true));
  process.exit(1);
}
