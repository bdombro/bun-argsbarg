/*
App-wide in-memory SQLite database.
*/

import { Database } from "bun:sqlite";
import type { InvokeHookContext, ReadinessContext } from "argsbarg";
import { migrate } from "./migrate.ts";
import { WorkspacesTable } from "./tables/workspaces.ts";

const DEFAULT_RETRY_DELAY_MS = 200;
const MAX_RETRY_DELAY_MS = 5000;

/**
 * Single SQLite database for this app.
 * Migrations run on construction; table accessors hang off {@link workspaces}.
 */
export class AppDb {
  /** CLI singleton; server invocations use `runtime.state.db` instead. */
  private static db: AppDb | undefined;

  /** Workspace rows and queries for this connection. */
  readonly workspaces: WorkspacesTable;

  constructor(readonly sqlite: Database) {
    migrate(sqlite);
    this.workspaces = new WorkspacesTable(sqlite);
  }

  /** Open a fresh in-memory database with foreign keys enabled. */
  static open(): AppDb {
    const sqlite = new Database(":memory:", { create: true });
    sqlite.run("PRAGMA foreign_keys = ON");
    return new AppDb(sqlite);
  }

  /** Open with bounded backoff, retrying until SQLite accepts connections (HTTP/MCP startup). */
  static openWithRetry(delayMs = DEFAULT_RETRY_DELAY_MS): AppDb {
    let attempt = 0;
    while (true) {
      try {
        const appDb = AppDb.open();
        appDb.ping();
        return appDb;
      } catch {
        attempt++;
        Bun.sleepSync(Math.min(delayMs * attempt, MAX_RETRY_DELAY_MS));
      }
    }
  }

  /** Shared database for non-server invocations (lazy CLI singleton). */
  static openDb(): AppDb {
    AppDb.db ??= AppDb.open();
    return AppDb.db;
  }

  /** Replace the CLI singleton with a fresh in-memory database (tests). */
  static resetForTests(): void {
    AppDb.db?.close();
    AppDb.db = AppDb.open();
  }

  /**
   * Wire `ctx.locals.db` before handlers run.
   * Server runtimes open with retry into `runtime.state.db`; CLI uses {@link openDb}.
   */
  static attach(
    ctx: Pick<InvokeHookContext, "locals" | "invocation"> & { runtime?: InvokeHookContext["runtime"] },
  ): void {
    if (ctx.runtime && (ctx.invocation === "http" || ctx.invocation === "mcp")) {
      ctx.runtime.state.db ??= AppDb.openWithRetry();
      ctx.locals.db = ctx.runtime.state.db;
      return;
    }
    ctx.locals.db = AppDb.openDb();
  }

  /** Readiness probe: ping `runtime.state.db` when the server database is open. */
  static checkReadiness(ctx: ReadinessContext): boolean {
    const appDb = ctx.runtime.state.db;
    if (!appDb) {
      return false;
    }
    try {
      appDb.ping();
      return true;
    } catch {
      return false;
    }
  }

  /** Verify SQLite responds to a trivial query. */
  ping(): void {
    this.sqlite.query("SELECT 1 AS ok").get();
  }

  /** Close the underlying database handle. */
  close(): void {
    this.sqlite.close();
  }
}
