/** JSON stdout for `full-example status --json`. */
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

/** Returns status JSON (identity helper for schema generation). */
export function buildStatusJson(output: StatusJsonOutput): StatusJsonOutput {
  return output;
}

/** Schemagen root for leaf outputSchema. */
export type outputType = StatusJsonOutput;
