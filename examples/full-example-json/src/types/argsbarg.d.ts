import type { AppDb } from "../db/index.ts";

declare module "argsbarg" {
  interface CliLocals {
    db: AppDb;
  }

  interface ServerState {
    db?: AppDb;
  }
}
