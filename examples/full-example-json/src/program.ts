/*
Reference CliProgram — builtins on; command registration only.
*/

import type { CliProgram } from "argsbarg";
import readmeText from "../README.md" with { type: "text" };
import { createIdentity } from "../scripts/create-identity.ts";
import { echoCommand } from "./commands/echo/command.ts";
import { renderJsonCommand } from "./commands/render-json/command.ts";
import { statusCommand } from "./commands/status/command.ts";
import { workspacesCommand } from "./commands/workspaces/command.ts";
import { AppDb } from "./db";

export const program = {
  commands: [echoCommand, renderJsonCommand, statusCommand, workspacesCommand],
  description: createIdentity.desc,
  docs: {
    topics: {
      readme: {
        text: readmeText,
      },
    },
  },
  hooks: {
    beforeInvoke: AppDb.attach,
  },
  httpServer: { enabled: true },
  key: createIdentity.key,
  mcpServer: { enabled: true },
  readiness: AppDb.checkReadiness,
  skill: { enabled: true },
  version: "1.0.0",
} satisfies CliProgram;
