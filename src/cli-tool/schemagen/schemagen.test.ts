import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSchemaRoots } from "./discover-schema-roots.ts";
import { schemaExportName, schemaJsonBasename } from "./names.ts";
import { runSchemagen } from "./run.ts";

const exampleRoot = join(import.meta.dir, "../../../examples/full-example");

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempProject(): string {
  const root = mkdtempSync(join(tmpdir(), "argsbarg-schemagen-"));
  tempRoots.push(root);
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
        },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
  );
  return root;
}

function writeSchema(root: string, relDir: string, body: string): void {
  const dir = join(root, "src", relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "schema.ts"), body);
}

describe("schemagen", () => {
  test("discovers AppConfig and StatusJsonOutput in full-example", () => {
    const roots = discoverSchemaRoots(exampleRoot);
    expect(roots.map((r) => `${r.kind}:${r.typeName}`).sort()).toEqual(["config:AppConfig", "output:StatusJsonOutput"]);
  });

  test("maps schema kinds to __generated__ filenames and export names", () => {
    expect(schemaJsonBasename("output")).toBe("outputSchema.json");
    expect(schemaJsonBasename("config")).toBe("configSchema.json");
    expect(schemaExportName("output")).toBe("outputSchema");
  });

  test("runSchemagen writes __generated__ artifacts in full-example", () => {
    const counts = runSchemagen({ projectRoot: exampleRoot });
    expect(counts).toEqual({ configRoots: 1, inputRoots: 0, outputRoots: 1 });
  });

  test("removes stale JSON files when a schema kind is dropped", () => {
    const root = makeTempProject();
    writeSchema(
      root,
      "commands/demo",
      `/** Tool input. */
export interface DemoInput { id: string; }
/** Tool output. */
export interface DemoOutput { ok: boolean; }
export type inputType = DemoInput;
export type outputType = DemoOutput;
`,
    );

    runSchemagen({ projectRoot: root });
    const generatedDir = join(root, "src/commands/demo/__generated__");
    expect(existsSync(join(generatedDir, "inputSchema.json"))).toBe(true);
    expect(existsSync(join(generatedDir, "outputSchema.json"))).toBe(true);

    writeSchema(
      root,
      "commands/demo",
      `/** Tool output. */
export interface DemoOutput { ok: boolean; }
export type outputType = DemoOutput;
`,
    );

    runSchemagen({ projectRoot: root });
    expect(existsSync(join(generatedDir, "inputSchema.json"))).toBe(false);
    expect(existsSync(join(generatedDir, "outputSchema.json"))).toBe(true);
    expect(existsSync(join(generatedDir, "index.ts"))).toBe(true);
  });

  test("removes orphan __generated__ when schema.ts is gone", () => {
    const root = makeTempProject();
    const generatedDir = join(root, "src/orphan/__generated__");
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(join(generatedDir, "outputSchema.json"), "{}\n");
    writeFileSync(join(generatedDir, "index.ts"), "export const outputSchema = {};\n");

    runSchemagen({ projectRoot: root });
    expect(existsSync(generatedDir)).toBe(false);
  });

  test("removes __generated__ when schema.ts has no discoverable roots", () => {
    const root = makeTempProject();
    writeSchema(
      root,
      "commands/empty",
      `export type outputType = never;
`,
    );
    const generatedDir = join(root, "src/commands/empty/__generated__");
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(join(generatedDir, "outputSchema.json"), "{}\n");

    runSchemagen({ projectRoot: root });
    expect(existsSync(generatedDir)).toBe(false);
  });
});
