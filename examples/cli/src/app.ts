/*
Reference AppSpec — builtins on; command registration only.
The version is read from `package.json` at runtime, so the same code runs from
`src/` (`node src/index.ts`) and from the compiled `dist/` (`npx example-cli`).
*/

import { readFileSync } from "node:fs";
import { argsbarg } from "argsbarg";
import { echoCommand } from "./commands/echo/command.ts";
import { statusCommand } from "./commands/status/command.ts";
import { createIdentity } from "./create-identity.ts";

/** Reads a file from the package root (one level above `src/` or `dist/`). */
function packageFile(
  /** Path relative to the package root. */
  rel: string,
): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

/** Package version from `package.json` (bumped by `npm run release`). */
const version = (JSON.parse(packageFile("package.json")) as { version: string }).version;

export const app = argsbarg({
  commands: [echoCommand, statusCommand],
  description: createIdentity.desc,
  key: createIdentity.key,
  mcpServer: { enabled: true },
  httpServer: { enabled: true },
  version,
});
