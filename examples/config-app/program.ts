/*
CliProgram for the config-app example — program.appConfig with jsonSchema + metadata overlay.
*/

import pkg from "../../package.json" with { type: "json" };
import {
  type CliAppConfig,
  type CliAppConfigEntry,
  CliOptionKind,
  type CliProgram,
} from "../../src/index.ts";
import { APP_CONFIG_JSON_SCHEMA } from "./schema.ts";

const configPath = process.env.CONFIG_APP_CONFIG_FILE;

const configSchema = {
  apiToken: {
    description: "Create at https://example.com/settings/tokens",
    env: "CONFIG_APP_API_TOKEN",
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
  key: "config-app",
  version: pkg.version,
  description: "Demonstrates program.appConfig, ctx.appConfig, and built-in config get/set.",
  appConfig: {
    ...(configPath ? { path: configPath } : {}),
    jsonSchema: APP_CONFIG_JSON_SCHEMA,
    entries: configSchema,
  } satisfies CliAppConfig,
  commands: [
    {
      key: "show",
      description: "Print resolved config (secrets redacted).",
      options: [
        {
          name: "json",
          description: "Emit JSON.",
          kind: CliOptionKind.Presence,
        },
      ],
      handler: (ctx) => {
        const out = {
          defaultRegion: ctx.appConfig.get("defaultRegion"),
          maxRetries: ctx.appConfig.get("maxRetries"),
          prefs: ctx.appConfig.get("prefs"),
          apiTokenSet: ctx.appConfig.get("apiToken") !== undefined,
        };
        if (ctx.hasFlag("json")) {
          console.log(JSON.stringify(out, null, 2));
        } else {
          console.log(`region=${out.defaultRegion ?? "(not set)"}`);
          console.log(`maxRetries=${out.maxRetries ?? "(not set)"}`);
          console.log(`prefs=${out.prefs ? JSON.stringify(out.prefs) : "(not set)"}`);
          console.log(`apiToken=${out.apiTokenSet ? "set" : "missing"}`);
        }
      },
    },
    {
      key: "ping",
      description: "Require apiToken and print a short confirmation.",
      handler: (ctx) => {
        const token = ctx.appConfig.require("apiToken");
        console.log(`ok (token length ${String(token).length})`);
      },
    },
  ],
} satisfies CliProgram;
