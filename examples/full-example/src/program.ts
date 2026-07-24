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
  key: createIdentity.key,
  version: "1.0.0",
  description: createIdentity.desc,
  docs: {
    topics: {
      readme: {
        text: readmeText,
      },
    },
  },
  mcpServer: { enabled: true },
  httpServer: { enabled: true },
  readiness: AppDb.checkReadiness,
  hooks: {
    beforeInvoke: AppDb.attach,
  },
  commands: [echoCommand, renderJsonCommand, statusCommand, workspacesCommand],
} satisfies CliProgram;
