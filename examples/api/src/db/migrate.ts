/*
Ordered SQL migrations for the example-api SQLite database.
*/

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/** `migrations/` next to this module (`npm run build` copies it into `dist/db/`). */
const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

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
export function appliedMigrationVersion(db: DatabaseSync): number {
  db.exec(SCHEMA_MIGRATIONS_DDL);
  const row = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as {
    version: number;
  };
  return row.version;
}

/** Apply pending migrations; returns how many files were applied. */
export function migrate(db: DatabaseSync, dir = MIGRATIONS_DIR): number {
  db.exec(SCHEMA_MIGRATIONS_DDL);
  let applied = 0;
  for (const migration of listMigrationFiles(dir)) {
    const seen = db.prepare("SELECT 1 AS ok FROM schema_migrations WHERE version = ?").get(migration.version);
    if (seen) {
      continue;
    }
    const sql = readFileSync(migration.path, "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(migration.version, migration.name);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    applied++;
  }
  return applied;
}
