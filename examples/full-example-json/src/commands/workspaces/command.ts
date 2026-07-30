/*
Workspaces CRUD — demonstrates REST verbs, :id param routers, and ctx.inputs path params.
*/

import { type CliProgram, type CliRouter, cliErrWithHelp } from "argsbarg";
import { WorkspaceNameInputSchema } from "./__generated__";

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
    {
      key: "post",
      description: "Create a workspace.",
      inputSchema: WorkspaceNameInputSchema,
      handler: (ctx) => {
        const { name } = ctx.inputsAs<{ name: string }>();
        return ctx.locals.db.workspaces.create(name);
      },
    },
    {
      key: ":id",
      description: "One workspace by id.",
      commands: [
        {
          key: "get",
          description: "Get one workspace.",
          handler: (ctx) => {
            const id = ctx.inputsAs<{ id: string }>().id;
            const ws = ctx.locals.db.workspaces.get(id);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          },
        },
        {
          key: "put",
          description: "Replace a workspace.",
          inputSchema: WorkspaceNameInputSchema,
          handler: (ctx) => {
            const { id, name } = ctx.inputsAs<{ id: string; name: string }>();
            const ws = ctx.locals.db.workspaces.replace(id, name);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          },
        },
        {
          key: "patch",
          description: "Patch a workspace name.",
          inputSchema: WorkspaceNameInputSchema,
          handler: (ctx) => {
            const { id, name } = ctx.inputsAs<{ id: string; name: string }>();
            const ws = ctx.locals.db.workspaces.patch(id, name);
            if (!ws) {
              notFound(ctx, id);
            }
            return ws;
          },
        },
        {
          key: "delete",
          description: "Delete a workspace.",
          handler: (ctx) => {
            const id = ctx.inputsAs<{ id: string }>().id;
            if (!ctx.locals.db.workspaces.delete(id)) {
              notFound(ctx, id);
            }
            ctx.respond({ status: 204, body: "" });
          },
        },
      ],
    },
  ],
} satisfies CliRouter;

/** Test program with workspaces registered. */
export function workspacesTestProgram(base: CliProgram): CliProgram {
  return {
    ...base,
    commands: [workspacesCommand],
  };
}
