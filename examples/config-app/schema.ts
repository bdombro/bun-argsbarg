/*
Inline draft-07 JSON Schema for AppConfig.
Production apps commit generated JSON and import via configSchemas.ts — see docs/config-schema.md.
*/

import type { AppConfig } from "./types.ts";

/** JSON Schema root for program.appConfig.jsonSchema (hand-written stand-in for schemagen). */
export const APP_CONFIG_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["apiToken", "maxRetries"],
  properties: {
    apiToken: { type: "string", minLength: 1 },
    defaultRegion: { type: "string", default: "us-east-1" },
    maxRetries: { type: "integer", minimum: 0, maximum: 10, default: 3 },
    prefs: {
      type: "object",
      additionalProperties: false,
      required: ["ttl"],
      properties: {
        ttl: { type: "integer", minimum: 1 },
      },
    },
  },
} as const satisfies Record<string, unknown>;

/** Compile-time check that schema keys align with AppConfig (documentation only). */
type _SchemaKeys = keyof typeof APP_CONFIG_JSON_SCHEMA.properties;
type _ConfigKeys = keyof AppConfig;
const _assertKeysAlign: _SchemaKeys extends _ConfigKeys
  ? _ConfigKeys extends _SchemaKeys
    ? true
    : never
  : never = true;
void _assertKeysAlign;
