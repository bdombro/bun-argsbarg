/*
Tests for docs/cli-guide module behavior.
*/

import { expect, test } from "bun:test";
import { cliSchemaExport } from "~/core/schema.ts";
import type { CliProgram } from "~/core/types.ts";
import { CliOptionKind } from "~/core/types.ts";
import { generateCliGuide, generateCliGuideBody } from "./cli-guide.ts";

const nestedFixture: CliProgram = {
  key: "nested.ts",
  version: "1.0.0",
  description: "Nested groups demo.",
  docs: { topics: { readme: { text: "# readme\n" } } },
  commands: [
    {
      key: "stat",
      description: "File metadata.",
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
  ],
};

test("generateCliGuideBody matches command section of full API guide", () => {
  const body = generateCliGuideBody(nestedFixture);
  const full = generateCliGuide(nestedFixture);
  expect(full).toContain(body.trimEnd());
  expect(body).toContain("## `nested.ts stat`");
  expect(body).not.toContain("CLI API reference");
});

test("generateCliGuide covers the same command keys as cliSchemaExport", () => {
  const md = generateCliGuide(nestedFixture);
  const schema = cliSchemaExport(nestedFixture);
  expect(md).toContain("`nested.ts stat owner lookup`");
  expect(md).toContain("`--user-name` (`-u`)");
  expect(md).toContain("`<path>`");
  expect(schema.commands?.map((c) => c.key)).toEqual(["stat"]);
});

test("generateCliGuide configure notes point to README not brew install", () => {
  const fixture: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  };
  const md = generateCliGuide(fixture);
  expect(md).not.toContain("{argsbarg:program}");
  expect(md).toContain("README");
  expect(md).not.toContain("brew install <tap>");
  expect(md).not.toContain("Upgrade to latest release");
});

test("generateCliGuide mentions Homebrew upgrade", () => {
  const fixture: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  };
  const md = generateCliGuide(fixture);
  expect(md).toContain("brew upgrade");
  expect(md).not.toContain("install --update");
});

/** Tests that generateCliGuide resolves {argsbarg:program} in consumer notes. */
test("generateCliGuide resolves {argsbarg:program} in consumer notes", () => {
  const fixture: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    commands: [
      {
        key: "run",
        description: "Run.",
        notes: "Invoke `{argsbarg:program} run`.",
        handler: () => {},
      },
    ],
  };
  const md = generateCliGuide(fixture);
  expect(md).toContain("Invoke `myapp run`.");
});

/** Tests that generateCliGuide and cliSchemaExport include leaf outputSchema. */
test("generateCliGuide and cliSchemaExport include leaf outputSchema", () => {
  const fixture: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    commands: [
      {
        key: "run",
        description: "Run.",
        outputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        handler: () => {},
      },
    ],
  };
  const schema = cliSchemaExport(fixture);
  expect(schema.commands?.[0]?.outputSchema).toEqual({
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  });
  const md = generateCliGuide(fixture);
  expect(md).toContain("#### Output");
  expect(md).toContain('"id"');
  expect(md).toContain('"type": "string"');
});
