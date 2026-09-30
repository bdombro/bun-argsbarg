import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, test } from "node:test";
import { appliedMigrationVersion, listMigrationFiles, migrate } from "./migrate.ts";

function openTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("migrate", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  test("lists migration files in version order", () => {
    const files = listMigrationFiles();
    assert.ok(files.length > 0);
    assert.equal(files[0]?.name, "001_workspaces.sql");
  });

  test("applies pending migrations once", () => {
    assert.equal(appliedMigrationVersion(db), 0);
    assert.equal(migrate(db), 1);
    assert.equal(appliedMigrationVersion(db), 1);
    assert.equal(migrate(db), 0);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'").get());
  });
});
