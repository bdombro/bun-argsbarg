import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ReadinessContext } from "argsbarg";
import { AppDb } from ".";

describe("AppDb", () => {
  let appDb: AppDb;

  beforeEach(() => {
    appDb = AppDb.open();
  });

  afterEach(() => {
    appDb.close();
  });

  test("workspace CRUD round trip", () => {
    const workspaces = appDb.workspaces;
    expect(workspaces.list()).toEqual([]);
    const created = workspaces.create("alpha");
    expect(workspaces.get(created.id)).toEqual(created);
    expect(workspaces.list()).toEqual([created]);
    expect(workspaces.patch(created.id, "beta")).toEqual({ ...created, name: "beta" });
    expect(workspaces.replace(created.id, "gamma")).toEqual({ id: created.id, name: "gamma" });
    expect(workspaces.delete(created.id)).toBe(true);
    expect(workspaces.get(created.id)).toBeUndefined();
  });

  test("ping succeeds on open database", () => {
    expect(() => appDb.ping()).not.toThrow();
  });
});

describe("AppDb.openWithRetry", () => {
  test("opens an in-memory database", () => {
    const appDb = AppDb.openWithRetry(1);
    try {
      appDb.workspaces.create("retry-ok");
      expect(appDb.workspaces.list()).toHaveLength(1);
    } finally {
      appDb.close();
    }
  });
});

describe("AppDb.attach", () => {
  test("sets ctx.locals.db", () => {
    const locals = {} as import("argsbarg").CliLocals;
    AppDb.attach({ locals, invocation: "cli" });
    locals.db.workspaces.create("attached");
    expect(locals.db.workspaces.list()).toHaveLength(1);
  });
});

describe("AppDb.checkReadiness", () => {
  test("returns false before server database is initialized", () => {
    const runtime = {
      state: {},
      program: { key: "t", description: "d" },
      surface: "http" as const,
    };
    const ctx = {
      program: runtime.program,
      surface: "http" as const,
      appConfig: { read: () => ({}) },
      runtime,
    } as unknown as ReadinessContext;
    expect(AppDb.checkReadiness(ctx)).toBe(false);
  });

  test("returns true when sqlite responds", () => {
    AppDb.resetForTests();
    const runtime = {
      state: { db: AppDb.open() },
      program: { key: "t", description: "d" },
      surface: "http" as const,
    };
    const ctx = {
      program: runtime.program,
      surface: "http" as const,
      appConfig: { read: () => ({}) },
      runtime,
    } as unknown as ReadinessContext;
    expect(AppDb.checkReadiness(ctx)).toBe(true);
    (runtime.state.db as AppDb).close();
  });
});
