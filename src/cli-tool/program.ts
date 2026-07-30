/*
Argsbarg developer tools — bootstrap consumer CLIs via `create`.
*/

import pkg from "../../package.json" with { type: "json" };
import { CliOptionKind, type CliProgram } from "../index.ts";
import { normalizeCreateTemplateId } from "./create.ts";
import { runCreate } from "./run-create.ts";
import { runSchemagenCli } from "./run-schemagen.ts";

export const program = {
  commands: [
    {
      key: "create",
      description: "Copy a CLI template into a directory with substitutions.",
      options: [
        {
          name: "template",
          description: "Template: cli (default) or json (schema-first).",
          kind: CliOptionKind.Enum,
          choices: ["cli", "json"],
        },
        { name: "key", description: "CLI binary name.", kind: CliOptionKind.String },
        {
          name: "class-name",
          description: "Homebrew formula Ruby class (default: derived from --key).",
          kind: CliOptionKind.String,
        },
        {
          name: "tap",
          description: "Homebrew tap (default: same as --release-repo).",
          kind: CliOptionKind.String,
        },
        {
          name: "homepage",
          description: "Formula homepage (default: https://github.com/<release-repo>).",
          kind: CliOptionKind.String,
        },
        {
          name: "release-repo",
          description: "GitHub org/repo for releases (required in non-interactive mode).",
          kind: CliOptionKind.String,
        },
        {
          name: "desc",
          description: "App + formula description (default: <ClassName> CLI; stored in create-identity.ts).",
          kind: CliOptionKind.String,
        },
        { name: "force", description: "Overwrite existing files.", kind: CliOptionKind.Presence },
        {
          name: "dry-run",
          description: "Print planned writes without changing disk.",
          kind: CliOptionKind.Presence,
        },
        {
          name: "check",
          description: "Fail if directory drifts from template output.",
          kind: CliOptionKind.Presence,
        },
        {
          name: "diff",
          description: "With --check, print a short diff for drifted files.",
          kind: CliOptionKind.Presence,
        },
        {
          name: "yes",
          description: "Skip confirmation (required when stdin is not a TTY).",
          kind: CliOptionKind.Presence,
        },
      ],
      positionals: [
        {
          name: "dir",
          description: "Target directory (default: current directory).",
          kind: CliOptionKind.String,
          argMin: 0,
          argMax: 1,
        },
      ],
      handler: async (ctx) => {
        const templateRaw = ctx.stringOpt("template");
        const code = await runCreate({
          dir: ctx.args[0],
          ...(templateRaw !== undefined ? { templateId: normalizeCreateTemplateId(templateRaw) } : {}),
          key: ctx.stringOpt("key"),
          className: ctx.stringOpt("class-name"),
          tap: ctx.stringOpt("tap"),
          homepage: ctx.stringOpt("homepage"),
          releaseRepo: ctx.stringOpt("release-repo"),
          desc: ctx.stringOpt("desc"),
          force: ctx.hasFlag("force"),
          dryRun: ctx.hasFlag("dry-run"),
          check: ctx.hasFlag("check"),
          diff: ctx.hasFlag("diff"),
          yes: ctx.hasFlag("yes"),
        });
        process.exit(code);
      },
    },
    {
      key: "schemagen",
      description:
        "Generate JSON Schema artifacts from @sg markers in src/**/*.ts into colocated __generated__/ directories.",
      options: [
        {
          name: "root",
          description: "Project root (default: current working directory).",
          kind: CliOptionKind.String,
        },
        {
          name: "src-dir",
          description: "Source directory relative to --root (default: src).",
          kind: CliOptionKind.String,
        },
        {
          name: "tsconfig",
          description: "Path to tsconfig relative to --root (default: tsconfig.json).",
          kind: CliOptionKind.String,
        },
      ],
      handler: (ctx) => {
        try {
          runSchemagenCli({
            root: ctx.stringOpt("root"),
            srcDir: ctx.stringOpt("src-dir"),
            tsconfig: ctx.stringOpt("tsconfig"),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          process.stderr.write(`${message}\n`);
          process.exit(1);
        }
      },
    },
  ],
  completion: { enabled: false },
  configure: { enabled: false },
  description: "Argsbarg developer tools — bootstrap CLIs from copy templates.",
  docs: { enabled: false },
  key: "argsbarg",
  version: pkg.version,
} satisfies CliProgram;
