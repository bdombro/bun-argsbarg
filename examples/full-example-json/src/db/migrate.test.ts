import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appliedMigrationVersion, listMigrationFiles, migrate } from "./migrate.ts";

function openTestDb(): Database {
  const db = new Database(":memory:", { create: true });
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

describe("migrate", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  test("lists migration files in version order", () => {
    const files = listMigrationFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]?.name).toBe("001_workspaces.sql");
  });

  test("applies pending migrations once", () => {
    expect(appliedMigrationVersion(db)).toBe(0);
    expect(migrate(db)).toBe(1);
    expect(appliedMigrationVersion(db)).toBe(1);
    expect(migrate(db)).toBe(0);
    expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'").get()).toBeTruthy();
  });
});
