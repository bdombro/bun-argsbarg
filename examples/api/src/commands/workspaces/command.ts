/*
Workspaces CRUD — demonstrates REST verbs, :id param routers, ctx.pathParams, and typed ctx.inputs bodies.
*/

import { type AppSpec, type CommandGroup, cliErrWithHelp, command } from "argsbarg";
import { WorkspaceIdParams, WorkspaceNameInput } from "./types.ts";

function notFound(ctx: Parameters<typeof cliErrWithHelp>[0], id: string): never {
  cliErrWithHelp(ctx, `Workspace not found: ${id}`);
}

export const workspacesCommand = {
  key: "workspaces",
  description: "Workspace collection and CRUD.",
  commands: [
    {
      key: "get",
      description: "List workspaces.",
      handler: (ctx) => ({ workspaces: ctx.locals.db.workspaces.list() }),
    },
    command({
      key: "post",
      description: "Create a workspace.",
      inputSchema: WorkspaceNameInput,
      handler: (ctx) => {
        const { name } = ctx.inputs;
        return ctx.locals.db.workspaces.create(name);
      },
    }),
    {
      key: ":id",
      description: "One workspace by id.",
      commands: [
        command({
          key: "get",
          pathParams: WorkspaceIdParams,
          description: "Get one workspace.",
          handler: (ctx) => {
            const id = ctx.pathParams.id;
            const ws = ctx.locals.db.workspaces.get(id);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          },
        }),
        command({
          key: "put",
          pathParams: WorkspaceIdParams,
          description: "Replace a workspace.",
          inputSchema: WorkspaceNameInput,
          handler: (ctx) => {
            const id = ctx.pathParams.id;
            const { name } = ctx.inputs;
            const ws = ctx.locals.db.workspaces.replace(id, name);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          },
        }),
        command({
          key: "patch",
          pathParams: WorkspaceIdParams,
          description: "Patch a workspace name.",
          inputSchema: WorkspaceNameInput,
          handler: (ctx) => {
            const id = ctx.pathParams.id;
            const { name } = ctx.inputs;
            const ws = ctx.locals.db.workspaces.patch(id, name);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          },
        }),
        command({
          key: "delete",
          pathParams: WorkspaceIdParams,
          description: "Delete a workspace.",
          handler: (ctx) => {
            const id = ctx.pathParams.id;
            if (!ctx.locals.db.workspaces.delete(id)) {
              notFound(ctx, id);
            }
            ctx.respond({ status: 204, body: "" });
          },
        }),
      ],
    },
  ],
} satisfies CommandGroup;

/** Test program with workspaces registered. */
export function workspacesTestSpec(base: AppSpec): AppSpec {
  return {
    ...base,
    commands: [workspacesCommand],
  };
}
