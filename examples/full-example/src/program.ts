/*
Reference CliProgram — builtins on; command registration only.
*/

import type { CliProgram } from "argsbarg";
import readmeText from "../README.md" with { type: "text" };
import { createIdentity } from "../scripts/create-identity.ts";
import { echoCommand } from "./commands/echo/command.ts";
import { statusCommand } from "./commands/status/command.ts";

export const program = {
  commands: [echoCommand, statusCommand],
  description: createIdentity.desc,
  docs: {
    topics: {
      readme: {
        text: readmeText,
      },
    },
  },
  key: createIdentity.key,
  mcpServer: { enabled: true },
  httpServer: { enabled: true },
  skill: { enabled: true },
  version: "1.0.0",
} satisfies CliProgram;
