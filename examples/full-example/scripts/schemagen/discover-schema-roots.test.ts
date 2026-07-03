import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { discoverSchemaRoots } from "./discover-schema-roots.ts";

const projectRoot = join(import.meta.dir, "../..");

describe("discover-schema-roots", () => {
  test("finds AppConfig and StatusJsonOutput in src types.ts files", () => {
    const roots = discoverSchemaRoots(projectRoot);
    const config = roots.find((r) => r.kind === "config");
    const output = roots.find((r) => r.kind === "output");
    expect(config).toMatchObject({
      typeName: "AppConfig",
      relFile: "src/types.ts",
      outfile: "app-config.json",
      exportName: "APP_CONFIG_JSON_SCHEMA",
    });
    expect(output).toMatchObject({
      typeName: "StatusJsonOutput",
      relFile: "src/commands/status/types.ts",
      outfile: "status.json",
      exportName: "STATUS_JSON_OUTPUT_SCHEMA",
    });
  });
});
