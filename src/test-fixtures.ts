import type { CliProgram } from "./types.ts";
import { CliFallbackMode, CliOptionKind } from "./types.ts";

export function testProgram(
  prog: Record<string, unknown> & { key: string; description: string },
): CliProgram {
  return { version: "0.0.0", ...prog } as CliProgram;
}

export const nestedMcpFixture = testProgram({
  key: "nested.ts",
  description: "Nested groups demo.",
  version: "1.0.0",
  mcpServer: { enabled: true },
  commands: [
    {
      key: "stat",
      description: "File metadata.",
      options: [
        {
          name: "json",
          description: "Emit handler output as JSON.",
          kind: CliOptionKind.Presence,
        },
      ],
      commands: [
        {
          key: "owner",
          description: "Ownership helpers.",
          commands: [
            {
              key: "lookup",
              description: "Resolve owner info.",
              options: [
                {
                  name: "user-name",
                  description: "User to look up.",
                  kind: CliOptionKind.String,
                  shortName: "u",
                },
              ],
              positionals: [
                {
                  name: "path",
                  description: "File or directory.",
                  kind: CliOptionKind.String,
                },
              ],
              handler: () => {},
            },
          ],
        },
      ],
    },
    {
      key: "read",
      description: "Print the first line of each file.",
      positionals: [
        {
          name: "files",
          description: "Paths to read.",
          kind: CliOptionKind.String,
          argMax: 0,
        },
      ],
      handler: () => {},
    },
    {
      key: "hidden",
      description: "Internal debug.",
      mcpTool: { enabled: false },
      handler: () => {},
    },
  ],
  fallbackCommand: "read",
  fallbackMode: CliFallbackMode.MissingOrUnknown,
});

/** Sends NDJSON MCP requests to a subprocess and collects responses by id. */
export async function mcpRequest(
  requests: object[],
  opts?: { script?: string; env?: Record<string, string> },
): Promise<Map<string | number, object>> {
  const script = opts?.script ?? "examples/nested.ts";
  const proc = Bun.spawn(["bun", "run", script, "mcp"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: opts?.env ? { ...process.env, ...opts.env } : process.env,
  });

  const input = requests.map((r) => `${JSON.stringify(r)}\n`).join("");
  proc.stdin.write(input);
  proc.stdin.end();

  const timeout = setTimeout(() => proc.kill(), 10_000);
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  clearTimeout(timeout);

  const byId = new Map<string | number, object>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const msg = JSON.parse(trimmed) as { id?: string | number };
    if (msg.id !== undefined) {
      byId.set(msg.id, msg);
    }
  }
  return byId;
}

export const enumMcpFixture = testProgram({
  key: "app",
  description: "",
  mcpServer: { enabled: true },
  commands: [
    {
      key: "run",
      description: "Run with mode.",
      options: [
        {
          name: "mode",
          description: "Mode.",
          kind: CliOptionKind.Enum,
          choices: ["dev", "prod"],
          required: true,
        },
      ],
      handler: () => {},
    },
  ],
});

export function varargsReadFixture(): CliProgram {
  return testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "read",
        description: "Read files.",
        options: [
          {
            name: "json",
            description: "",
            kind: CliOptionKind.Presence,
          },
        ],
        positionals: [
          {
            name: "files",
            description: "",
            kind: CliOptionKind.String,
            argMin: 0,
            argMax: 0,
          },
        ],
        handler: () => {},
      },
    ],
  });
}

export function nestedDocsFallbackFixture(): CliProgram {
  return testProgram({
    key: "app",
    description: "",
    commands: [
      {
        key: "docs",
        description: "Documentation commands.",
        fallbackCommand: "guide",
        fallbackMode: CliFallbackMode.MissingOnly,
        commands: [
          {
            key: "guide",
            description: "User guide.",
            handler: () => {},
          },
          {
            key: "api",
            description: "API reference.",
            handler: () => {},
          },
        ],
      },
    ],
  });
}
