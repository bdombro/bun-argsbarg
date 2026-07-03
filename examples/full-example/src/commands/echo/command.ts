/*
Echo leaf — minimal MCP-friendly command.
*/

import { type CliLeaf, CliOptionKind } from "argsbarg";

export const echoCommand = {
  key: "echo",
  description: "Echo a message (MCP-friendly leaf).",
  options: [
    {
      name: "message",
      description: "Text to print.",
      kind: CliOptionKind.String,
      required: true,
    },
  ],
  handler: (ctx) => {
    console.log(ctx.stringOpt("message") ?? "");
  },
} satisfies CliLeaf;
