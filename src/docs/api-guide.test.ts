import { expect, test } from "bun:test";
import type { CliProgram } from "../types.ts";
import { CliOptionKind } from "../types.ts";
import { generateApiGuide } from "./api-guide.ts";
import { cliSchemaExport } from "../schema.ts";

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
  expect(md).toContain("myapp install --all --yes");
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
