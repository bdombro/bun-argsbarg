/**
 * Config schema
 *
 * Application settings for `consumer-app` (`program.appConfig`).
 */
export interface AppConfig {
  /** API token from the provider dashboard. */
  apiToken: string;
  /**
   * AWS region (default us-east-1).
   * @default us-east-1
   */
  defaultRegion?: string;
  /**
   * HTTP retry count (default 3).
   * @default 3
   */
  maxRetries: number;
  /** Local preferences (file-only; not mapped to process.env). */
  prefs?: {
    ttl: number;
  };
}
