/**
 * Config schema
 *
 * Application settings persisted in a flat JSON file (`program.appConfig`).
 * In a production app, generate `APP_CONFIG_JSON_SCHEMA` from this interface
 * with ts-json-schema-generator — see docs/config-schema.md.
 */
export interface AppConfig {
  /** API token from the provider dashboard. */
  apiToken: string;
  /** AWS region (default us-east-1). */
  defaultRegion?: string;
  /** HTTP retry count (default 3). */
  maxRetries: number;
  /** Local preferences (file-only; not mapped to process.env). */
  prefs?: {
    ttl: number;
  };
}
