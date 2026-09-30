/*
Reference AppSpec for the Homebrew template — builtins on; command registration only.
*/

import { argsbarg } from "argsbarg";
import { echoCommand } from "./commands/echo/command.ts";
import { statusCommand } from "./commands/status/command.ts";
import { createIdentity } from "./create-identity.ts";

export const app = argsbarg({
  commands: [echoCommand, statusCommand],
  description: createIdentity.desc,
  key: createIdentity.key,
  version: "1.0.0",
});
