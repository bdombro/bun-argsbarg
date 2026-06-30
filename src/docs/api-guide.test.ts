import { expect, test } from "bun:test";
import { cliSchemaExport } from "../schema.ts";
import type { CliProgram } from "../types.ts";
import { CliOptionKind } from "../types.ts";
import { generateApiGuide, generateApiGuideBody } from "./api-guide.ts";

const nestedFixture: CliProgram = {
  key: "nested.ts",
  version: "1.0.0",
  description: "Nested groups demo.",
  docs: { enabled: true, topics: { readme: { text: "# readme\n" } } },
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

test("generateApiGuideBody matches command section of full API guide", () => {
  const body = generateApiGuideBody(nestedFixture);
  const full = generateApiGuide(nestedFixture);
  expect(full).toContain(body.trimEnd());
  expect(body).toContain("## `nested.ts stat`");
  expect(body).not.toContain("CLI API reference");
});

test("generateApiGuide covers the same command keys as cliSchemaExport", () => {
  const md = generateApiGuide(nestedFixture);
  const schema = cliSchemaExport(nestedFixture);
  expect(md).toContain("`nested.ts stat owner lookup`");
  expect(md).toContain("`--user-name` (`-u`)");
  expect(md).toContain("`<path>`");
  expect(schema.commands?.map((c) => c.key)).toEqual(["stat"]);
});

test("generateApiGuide resolves program key in install notes", () => {
  const fixture: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  };
  const md = generateApiGuide(fixture);
  expect(md).not.toContain("{argsbarg:program}");
  expect(md).toContain("myapp install --yes");
  expect(md).not.toContain("Upgrade to latest release");
});

test("generateApiGuide includes upgrade section when updateGetLatest is set", () => {
  const fixture: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    install: { updateGetLatest: async () => ({ path: process.execPath }) },
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  };
  const md = generateApiGuide(fixture);
  expect(md).toContain("Upgrade to latest release");
  expect(md).toContain("myapp install --update");
});

test("generateApiGuide resolves {argsbarg:program} in consumer notes", () => {
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
  const md = generateApiGuide(fixture);
  expect(md).toContain("Invoke `myapp run`.");
});

test("generateApiGuide and cliSchemaExport include leaf outputSchema", () => {
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
  const md = generateApiGuide(fixture);
  expect(md).toContain("#### Output");
  expect(md).toContain('"id"');
  expect(md).toContain('"type": "string"');
});
