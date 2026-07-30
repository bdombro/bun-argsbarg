import type { Database } from "bun:sqlite";

/** One workspace row from the `workspaces` table. */
export interface Workspace {
  id: string;
  name: string;
}

/** Workspace rows and CRUD queries. */
export class WorkspacesTable {
  private readonly listStmt;
  private readonly getStmt;
  private readonly insertStmt;
  private readonly updateStmt;
  private readonly deleteStmt;

  constructor(readonly sqlite: Database) {
    this.listStmt = sqlite.query("SELECT id, name FROM workspaces ORDER BY rowid");
    this.getStmt = sqlite.query("SELECT id, name FROM workspaces WHERE id = ?");
    this.insertStmt = sqlite.query("INSERT INTO workspaces (id, name) VALUES (?, ?)");
    this.updateStmt = sqlite.query("UPDATE workspaces SET name = ? WHERE id = ?");
    this.deleteStmt = sqlite.query("DELETE FROM workspaces WHERE id = ?");
  }

  /** All workspaces in insertion order. */
  list(): Workspace[] {
    return this.listStmt.all() as Workspace[];
  }

  /** Lookup workspace by id, or undefined when missing. */
  get(id: string): Workspace | undefined {
    const row = this.getStmt.get(id) as Workspace | null;
    return row ?? undefined;
  }

  /** Create a workspace with a new id. */
  create(name: string): Workspace {
    const id = crypto.randomUUID();
    this.insertStmt.run(id, name);
    return { id, name };
  }

  /** Replace workspace name when id exists; otherwise undefined. */
  replace(id: string, name: string): Workspace | undefined {
    const result = this.updateStmt.run(name, id);
    if (result.changes === 0) {
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
    return this.deleteStmt.run(id).changes > 0;
  }
}
