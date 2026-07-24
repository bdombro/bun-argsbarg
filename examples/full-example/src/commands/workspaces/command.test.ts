import { beforeEach, describe, expect, test } from "bun:test";
import { Cli, type CliProgram } from "argsbarg";
import { AppDb } from "~/db";
import { workspacesTestProgram } from "./command.ts";

const baseProgram = {
  key: "full-example",
  version: "1.0.0",
  description: "Demo.",
  httpServer: { enabled: true },
  commands: [],
  hooks: {
    beforeInvoke: AppDb.attach,
  },
} satisfies CliProgram;

describe("workspaces command", () => {
  const program = workspacesTestProgram(baseProgram);
  const cli = new Cli(program);

  beforeEach(() => {
    AppDb.resetForTests();
  });

  test("GET workspaces lists empty collection", async () => {
    const result = await cli.invoke(["workspaces", "get"], { invocation: "http" });
    expect(result.kind).toBe("ok");
    expect(result.response?.body).toEqual({ workspaces: [] });
  });

  test("POST workspaces creates resource", async () => {
    const created = await cli.invoke(["workspaces", "post"], {
      invocation: "http",
      toolArgs: { name: "qa2" },
    });
    expect(created.kind).toBe("ok");
    const body = created.response?.body as { id: string; name: string };
    expect(body.name).toBe("qa2");
    expect(body.id.length).toBeGreaterThan(0);

    const got = await cli.invoke(["workspaces", body.id, "get"], { invocation: "http" });
    expect(got.kind).toBe("ok");
    expect(got.response?.body).toEqual(body);
  });

  test("CLI workspaces :id get resolves path param", async () => {
    const created = await cli.invoke(["workspaces", "post"], {
      invocation: "http",
      toolArgs: { name: "cli-ws" },
    });
    expect(created.kind).toBe("ok");
    const id = (created.response?.body as { id: string }).id;

    const got = await cli.invoke(["workspaces", id, "get"], { invocation: "http" });
    expect(got.kind).toBe("ok");
    expect(got.response?.body).toEqual({ id, name: "cli-ws" });
  });
});
