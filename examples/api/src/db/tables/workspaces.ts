import { randomUUID } from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";

/** One workspace row from the `workspaces` table. */
export interface Workspace {
  id: string;
  name: string;
}

/** Workspace rows and CRUD queries. */
export class WorkspacesTable {
  private readonly listStmt: StatementSync;
  private readonly getStmt: StatementSync;
  private readonly insertStmt: StatementSync;
  private readonly updateStmt: StatementSync;
  private readonly deleteStmt: StatementSync;

  constructor(sqlite: DatabaseSync) {
    this.listStmt = sqlite.prepare("SELECT id, name FROM workspaces ORDER BY rowid");
    this.getStmt = sqlite.prepare("SELECT id, name FROM workspaces WHERE id = ?");
    this.insertStmt = sqlite.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)");
    this.updateStmt = sqlite.prepare("UPDATE workspaces SET name = ? WHERE id = ?");
    this.deleteStmt = sqlite.prepare("DELETE FROM workspaces WHERE id = ?");
  }

  /** All workspaces in insertion order. */
  list(): Workspace[] {
    return this.listStmt.all().map(toWorkspace);
  }

  /** Lookup workspace by id, or undefined when missing. */
  get(id: string): Workspace | undefined {
    const row = this.getStmt.get(id);
    return row === undefined ? undefined : toWorkspace(row);
  }

  /** Create a workspace with a new id. */
  create(name: string): Workspace {
    const id = randomUUID();
    this.insertStmt.run(id, name);
    return { id, name };
  }

  /** Replace workspace name when id exists; otherwise undefined. */
  replace(id: string, name: string): Workspace | undefined {
    const result = this.updateStmt.run(name, id);
    if (Number(result.changes) === 0) {
      return undefined;
    }
    return { id, name };
  }

  /** Patch workspace name when id exists; otherwise undefined. */
  patch(id: string, name: string): Workspace | undefined {
    const existing = this.get(id);
    if (!existing) {
      return undefined;
    }
    this.updateStmt.run(name, id);
    return { ...existing, name };
  }

  /** Remove workspace by id; true when a row was deleted. */
  delete(id: string): boolean {
    return Number(this.deleteStmt.run(id).changes) > 0;
  }
}

/** Copies a `node:sqlite` row (null-prototype object) into a plain {@link Workspace}. */
function toWorkspace(row: Record<string, unknown>): Workspace {
  return { id: String(row.id), name: String(row.name) };
}
