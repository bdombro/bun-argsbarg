/*
Compile-only checks that invalid schema shapes fail type-checking.
*/

import type { CliLeaf, CliNode, CliProgram, CliRouter } from "./types.ts";

const _routerOnly: CliRouter = {
  key: "app",
  description: "",
  commands: [],
};

const _leafOnly: CliLeaf = {
  key: "run",
  description: "",
  handler: () => {},
};

const _program: CliProgram = {
  key: "app",
  description: "",
  mcpServer: {},
  commands: [],
};

const _badMcpOnNode = {
  key: "x",
  description: "",
  // @ts-expect-error mcpServer is program-root only
  mcpServer: {},
  commands: [],
} satisfies CliNode;

const _badInstallOnNode = {
  key: "x",
  description: "",
  // @ts-expect-error install is program-root only
  install: { enabled: false },
  handler: () => {},
} satisfies CliNode;
