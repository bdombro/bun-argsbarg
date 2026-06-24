/** JSON payload for `consumer-app status --json`. */
export interface StatusJsonOutput {
  /** Resolved AWS region. */
  defaultRegion?: string;
  /** Resolved retry count. */
  maxRetries?: number;
  /** Whether apiToken is set (value never included). */
  apiTokenSet: boolean;
  /** App version from program root. */
  version: string;
}
