/*
Tests for docs/cli-guide module behavior.
*/

import { expect, test } from "bun:test";
import { z } from "zod";
import { schemaExport } from "../core/schema.ts";
import type { AppSpec } from "../core/types.ts";
import { OptionKind } from "../core/types.ts";
import { generateCliGuide, generateCliGuideBody } from "./cli-guide.ts";

const nestedFixture: AppSpec = {
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
                  kind: OptionKind.String,
                  shortName: "u",
                },
              ],
              positionals: [
                {
                  name: "path",
                  description: "File or directory.",
                  kind: OptionKind.String,
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

test("generateCliGuide covers the same command keys as schemaExport", () => {
  const md = generateCliGuide(nestedFixture);
  const schema = schemaExport(nestedFixture);
  expect(md).toContain("`nested.ts stat owner lookup`");
  expect(md).toContain("`--user-name` (`-u`)");
  expect(md).toContain("`<path>`");
  expect(schema.commands?.map((c) => c.key)).toEqual(["stat"]);
});

test("generateCliGuide configure notes point to README not brew install", () => {
  const fixture: AppSpec = {
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
  const fixture: AppSpec = {
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
  const fixture: AppSpec = {
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

/** Tests that generateCliGuide and schemaExport include leaf outputSchema. */
test("generateCliGuide and schemaExport include leaf outputSchema", () => {
  const fixture: AppSpec = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    commands: [
      {
        key: "run",
        description: "Run.",
        outputSchema: z.object({ id: z.string() }),
        handler: () => {},
      },
    ],
  };
  const schema = schemaExport(fixture);
  expect(schema.commands?.[0]?.outputSchema).toMatchObject({
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  });
  const md = generateCliGuide(fixture);
  expect(md).toContain("#### Output");
  expect(md).toContain('"id"');
  expect(md).toContain('"type": "string"');
});

/** Tests that schemaExport includes synthesized and custom inputSchema on commands with a handler. */
test("schemaExport includes leaf inputSchema", () => {
  const fixture: AppSpec = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    commands: [
      {
        key: "greet",
        description: "Greet user.",
        options: [
          { name: "name", description: "User name", kind: OptionKind.String, required: true },
          { name: "json", description: "JSON flag", kind: OptionKind.Presence },
        ],
        handler: () => {},
      },
      {
        key: "deploy",
        description: "Deploy resource.",
        kind: "document",
        inputSchema: z.object({ target: z.string() }),
        handler: () => {},
      },
    ],
  };

  const schema = schemaExport(fixture);
  const greet = schema.commands?.[0];
  const deploy = schema.commands?.[1];

  expect(greet?.inputSchema).toEqual({
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "User name",
      },
    },
    additionalProperties: false,
    required: ["name"],
  });

  expect(deploy?.inputSchema).toMatchObject({
    type: "object",
    properties: { target: { type: "string" } },
    required: ["target"],
  });
});
