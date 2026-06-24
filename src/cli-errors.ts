/*
Handler error helper with contextual help.
*/

import { cliPresentationRoot } from "./builtins/presentation.ts";
import type { CliContext } from "./context.ts";
import { cliHelpRender } from "./help.ts";

export function cliErrWithHelp(ctx: CliContext, msg: string): never {
  const color = process.stderr.isTTY;
  const line = color ? `\u001B[31m${msg}\u001B[0m` : msg;
  process.stderr.write(`${line}\n`);
  process.stderr.write(cliHelpRender(cliPresentationRoot(ctx.program), ctx.commandPath, true));
  process.exit(1);
}
