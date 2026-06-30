/*
Kitchen-sink CliProgram — every argsbarg builtin enabled.
*/

import {
  type CliAppConfig,
  type CliAppConfigEntry,
  CliOptionKind,
  type CliProgram,
} from "argsbarg";
import readmeText from "../README.md" with { type: "text" };
import { APP_CONFIG_JSON_SCHEMA } from "../schemas/configSchemas.ts";
import { STATUS_JSON_OUTPUT_SCHEMA } from "../schemas/outputSchemas.ts";
import type { StatusJsonOutput } from "./commands/status/types.ts";

const configSchema = {
  apiToken: {
    description: "Create at https://example.com/settings/tokens",
    env: "CONSUMER_APP_API_TOKEN",
    sensitive: true,
  },
  defaultRegion: {
    description: "AWS region for API calls.",
    required: false,
  },
  maxRetries: {
    description: "HTTP retry count (0–10).",
  },
  prefs: {
    description: "Local cache preferences (not exported to env).",
    required: false,
  },
} as const satisfies Record<string, CliAppConfigEntry>;

export const program = {
  key: "consumer-app",
  version: "1.0.0",
  description: "Argsbarg kitchen-sink reference — all builtins, schemagen, ctx.appConfig.",
  appConfig: {
    jsonSchema: APP_CONFIG_JSON_SCHEMA,
    entries: configSchema,
  } satisfies CliAppConfig,
  docs: {
    enabled: true,
    topics: {
      readme: {
        text: readmeText,
      },
    },
  },
  mcpServer: {
    enabled: true,
    mcpd: true,
    claudePlugin: true,
  },
  install: {
    // Defaults: app + completions + configure; agentIntegration picks skill vs MCP for --all.
    updateGetLatest: async () => ({
      path: process.execPath,
      version: "1.0.0",
    }),
  },
  commands: [
    {
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
    },
    {
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
    },
  ],
} satisfies CliProgram;
