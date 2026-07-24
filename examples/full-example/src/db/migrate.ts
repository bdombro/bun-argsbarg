/*
Ordered SQL migrations for the full-example SQLite database.
*/

import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

const SCHEMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

interface MigrationFile {
  version: number;
  name: string;
  path: string;
}

/** Sorted migration files under src/db/migrations (e.g. 001_workspaces.sql). */
export function listMigrationFiles(dir = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => {
      const match = /^(\d+)_(.+)\.sql$/.exec(name);
      if (!match) {
        throw new Error(`Invalid migration filename (expected NNN_name.sql): ${name}`);
      }
      return {
        version: Number(match[1]),
        name,
        path: join(dir, name),
      };
    })
    .sort((a, b) => a.version - b.version);
}

/** Highest applied migration version, or 0 when schema_migrations is empty. */
export function appliedMigrationVersion(db: Database): number {
  db.run(SCHEMA_MIGRATIONS_DDL);
  const row = db.query("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as {
    version: number;
  };
  return row.version;
}

/** Apply pending migrations; returns how many files were applied. */
export function migrate(db: Database, dir = MIGRATIONS_DIR): number {
  db.run(SCHEMA_MIGRATIONS_DDL);
  let applied = 0;
  for (const migration of listMigrationFiles(dir)) {
    const seen = db.query("SELECT 1 AS ok FROM schema_migrations WHERE version = ?").get(migration.version) as {
      ok: number;
    } | null;
    if (seen) {
      continue;
    }
    const sql = readFileSync(migration.path, "utf8");
    db.transaction(() => {
      db.run(sql);
      db.run("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", [migration.version, migration.name]);
    })();
    applied++;
  }
  return applied;
}
