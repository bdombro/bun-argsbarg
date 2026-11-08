/*
Argsbarg developer tools — bootstrap consumer CLIs via `create`.
*/

import { argsbarg, command, OptionKind } from "../index.ts";
import { mcpGatewayServe, parseGatewayEntries } from "../mcp/gateway.ts";
import { argsbargPackageVersion, CREATE_TEMPLATES } from "./create.ts";
import { runCreate } from "./run-create.ts";

export const app = argsbarg({
  commands: [
    command({
      key: "gateway",
      description:
        "Serve several argsbarg MCP plugin bundles from one process over stdio (MCP). Tools are named <alias>_<tool>.",
      options: [
        {
          name: "name",
          description: "Server name reported to MCP clients (default: argsbarg-gateway).",
          kind: OptionKind.String,
        },
      ],
      positionals: [
        {
          name: "bundles",
          description: "Plugin bundles as [alias=]path, e.g. notes=plugins/obsidian/dist/obsidian.mjs.",
          kind: OptionKind.String,
          argMin: 1,
          argMax: 0,
        },
      ],
      handler: async (ctx) => {
        await mcpGatewayServe(parseGatewayEntries(ctx.positional("bundles") as string[]), {
          name: ctx.inputs.name ?? "argsbarg-gateway",
          version: argsbargPackageVersion(),
        });
        process.exit(0);
      },
    }),
    command({
      key: "create",
      description: "Copy a CLI template into a directory with substitutions.",
      options: [
        {
          name: "template",
          description: `Template (default: cli): ${CREATE_TEMPLATES.map((t) => `${t.id} (${t.summary})`).join(", ")}.`,
          kind: OptionKind.Enum,
          choices: CREATE_TEMPLATES.map((t) => t.id),
        },
        { name: "key", description: "CLI binary name.", kind: OptionKind.String },
        {
          name: "release-repo",
          description: "GitHub org/repo for releases (required in non-interactive mode).",
          kind: OptionKind.String,
        },
        {
          name: "desc",
          description: "App description (default: <key> CLI; stored in src/create-identity.ts).",
          kind: OptionKind.String,
        },
        { name: "force", description: "Overwrite existing files.", kind: OptionKind.Presence },
        {
          name: "dry-run",
          description: "Print planned writes without changing disk.",
          kind: OptionKind.Presence,
        },
        {
          name: "check",
          description: "Fail if directory drifts from template output.",
          kind: OptionKind.Presence,
        },
        {
          name: "diff",
          description: "With --check, print a short diff for drifted files.",
          kind: OptionKind.Presence,
        },
        {
          name: "yes",
          description: "Skip confirmation (required when stdin is not a TTY).",
          kind: OptionKind.Presence,
        },
      ],
      positionals: [
        {
          name: "dir",
          description: "Target directory (default: current directory).",
          kind: OptionKind.String,
          argMin: 0,
          argMax: 1,
        },
      ],
      handler: async (ctx) => {
        const inputs = ctx.inputs;
        const code = await runCreate({
          dir: inputs.dir,
          ...(inputs.template !== undefined ? { templateId: inputs.template } : {}),
          key: inputs.key,
          releaseRepo: inputs["release-repo"],
          desc: inputs.desc,
          force: inputs.force,
          dryRun: inputs["dry-run"],
          check: inputs.check,
          diff: inputs.diff,
          yes: inputs.yes,
        });
        process.exit(code);
      },
    }),
  ],
  completion: { enabled: false },
  description: "Argsbarg developer tools — bootstrap CLIs from copy templates.",
  key: "argsbarg",
  version: argsbargPackageVersion(),
});
