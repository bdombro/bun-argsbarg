/*
Kitchen-sink CliProgram — every argsbarg builtin enabled; command registration only.
*/

import type { CliAppConfig, CliAppConfigEntry, CliProgram } from "argsbarg";
import readmeText from "../README.md" with { type: "text" };
import { APP_CONFIG_JSON_SCHEMA } from "../schemas/configSchemas.ts";
import { createIdentity } from "../scripts/create-identity.ts";
import { echoCommand } from "./commands/echo/command.ts";
import { statusCommand } from "./commands/status/command.ts";

const configSchema = {
  apiToken: {
    description: "Create at https://example.com/settings/tokens",
    env: `${createIdentity.envPrefix}_API_TOKEN`,
    sensitive: true,
  },
  defaultRegion: {
    description: "AWS region for API calls.",
    required: false,
  },
  maxRetries: {
    description: "HTTP retry count (0–10).",
    required: false,
  },
  prefs: {
    description: "Local cache preferences (not exported to env).",
    required: false,
  },
} as const satisfies Record<string, CliAppConfigEntry>;

export const program = {
  key: createIdentity.key,
  version: "1.0.0",
  description: createIdentity.desc,
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
  apiServer: {
    enabled: true,
  },
  commands: [echoCommand, statusCommand],
} satisfies CliProgram;
