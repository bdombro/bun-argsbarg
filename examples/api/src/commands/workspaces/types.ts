/*
Request body and path parameter schemas for the workspaces commands.
*/

import { z } from "zod";

/** Body for workspace create/replace/patch. */
export const WorkspaceNameInput = z.strictObject({
  name: z.string().describe("Workspace display name."),
});

/** Parsed workspace name body. */
export type WorkspaceNameInput = z.infer<typeof WorkspaceNameInput>;

/** `:id` path parameter for single-workspace commands. */
export const WorkspaceIdParams = z.strictObject({
  id: z.string().describe("Workspace id (from `workspaces post` or `workspaces get`)."),
});
