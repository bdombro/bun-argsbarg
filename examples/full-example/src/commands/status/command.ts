/*
Status leaf — demonstrates outputSchema and ctx.appConfig.
*/

import { type CliLeaf, CliOptionKind } from "argsbarg";
import { STATUS_JSON_OUTPUT_SCHEMA } from "../../../schemas/outputSchemas.ts";
import type { StatusJsonOutput } from "./types.ts";

export const statusCommand = {
  key: "status",
  description: "Show resolved config and app version.",
  options: [
    {
      name: "json",
      description: "Emit JSON.",
      kind: CliOptionKind.Presence,
    },
  ],
  outputSchema: STATUS_JSON_OUTPUT_SCHEMA,
  handler: (ctx) => {
    const out: StatusJsonOutput = {
      defaultRegion: ctx.appConfig.get("defaultRegion") as string | undefined,
      maxRetries: ctx.appConfig.get("maxRetries") as number | undefined,
      apiTokenSet: ctx.appConfig.get("apiToken") !== undefined,
      version: ctx.program.version,
    };
    if (ctx.hasFlag("json")) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`version=${out.version}`);
      console.log(`region=${out.defaultRegion ?? "(not set)"}`);
      console.log(`maxRetries=${out.maxRetries ?? "(not set)"}`);
      console.log(`apiToken=${out.apiTokenSet ? "set" : "missing"}`);
    }
  },
} satisfies CliLeaf;
