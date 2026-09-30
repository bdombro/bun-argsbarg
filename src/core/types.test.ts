/*
Compile-only checks that invalid schema shapes fail type-checking.
*/

import type { AppSpec, Command, CommandGroup, RunnableCommand } from "./types.ts";

const _routerOnly: CommandGroup = {
  key: "app",
  description: "",
  commands: [],
};

const _leafOnly: RunnableCommand = {
  key: "run",
  description: "",
  handler: () => {},
};

const _program: AppSpec = {
  key: "app",
  version: "0.0.0",
  description: "",
  mcpServer: { enabled: true },
  commands: [],
};

const _badMcpOnNode = {
  key: "x",
  description: "",
  // @ts-expect-error mcpServer is program-root only
  mcpServer: { enabled: true },
  commands: [],
} satisfies Command;

const _badInstallOnNode = {
  key: "x",
  description: "",
  // @ts-expect-error install is program-root only
  install: { enabled: false },
  handler: () => {},
} satisfies Command;
