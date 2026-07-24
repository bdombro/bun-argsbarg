import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function writeSrcFile(root: string, relPath: string, body: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body);
}

describe("schemagen", () => {
  test("discovers @sg types in full-example", () => {
    const roots = discoverSchemaRoots(exampleRoot);
    expect(roots.map((r) => r.typeName).sort()).toEqual(["RenderJsonInput", "StatusJsonOutput", "WorkspaceNameInput"]);
  });

  test("maps type names to __generated__ filenames and export names", () => {
    expect(schemaJsonBasename("StatusJsonOutput")).toBe("StatusJsonOutputSchema.json");
    expect(schemaExportName("RenderJsonInput")).toBe("RenderJsonInputSchema");
  });

  test("runSchemagen writes __generated__ artifacts in full-example", () => {
    const counts = runSchemagen({ projectRoot: exampleRoot });
    expect(counts).toEqual({ schemas: 3 });
  });

  test("discovers @sg roots and writes named schema artifacts", () => {
    const root = makeTempProject();
    const dir = join(root, "src/commands/demo");
    writeSrcFile(
      root,
      "src/commands/demo/types.ts",
      `/** @sg */
export interface DemoOutput {
  ok: boolean;
}
`,
    );

    const roots = discoverSchemaRoots(root);
    expect(roots).toEqual([
      {
        typeName: "DemoOutput",
        path: "src/commands/demo/types.ts",
        sourcePath: "src/commands/demo/types.ts",
      },
    ]);
    runSchemagen({ projectRoot: root });
    expect(existsSync(join(dir, "__generated__/DemoOutputSchema.json"))).toBe(true);
    expect(existsSync(join(dir, "__generated__/index.ts"))).toBe(true);
  });

  test("errors on blank line between @sg JSDoc and export", () => {
    const root = makeTempProject();
    writeSrcFile(
      root,
      "src/commands/demo/types.ts",
      `/** @sg */

export interface DemoOutput {
  ok: boolean;
}
`,
    );

    expect(() => discoverSchemaRoots(root)).toThrow(
      "src/commands/demo/types.ts: @sg JSDoc must be immediately followed by export interface/type",
    );
  });

  test("two @sg types in same directory share one index.ts", () => {
    const root = makeTempProject();
    writeSrcFile(
      root,
      "src/commands/demo/types.ts",
      `/** @sg */
export interface DemoInput {
  id: string;
}
`,
    );
    writeSrcFile(
      root,
      "src/commands/demo/command.ts",
      `/** @sg */
export interface DemoOutput {
  ok: boolean;
}
`,
    );

    runSchemagen({ projectRoot: root });
    const generatedDir = join(root, "src/commands/demo/__generated__");
    const text = readFileSync(join(generatedDir, "index.ts"), "utf8");
    expect(text).toContain("DemoInputSchema");
    expect(text).toContain("DemoOutputSchema");
    expect(existsSync(join(generatedDir, "DemoInputSchema.json"))).toBe(true);
    expect(existsSync(join(generatedDir, "DemoOutputSchema.json"))).toBe(true);
  });

  test("skips *.test.ts and __generated__ during walk", () => {
    const root = makeTempProject();
    writeSrcFile(
      root,
      "src/commands/demo/types.test.ts",
      `/** @sg */
export interface ShouldNotDiscover {
  x: string;
}
`,
    );
    writeSrcFile(
      root,
      "src/commands/demo/__generated__/orphan.ts",
      `/** @sg */
export interface AlsoSkipped {
  x: string;
}
`,
    );

    expect(discoverSchemaRoots(root)).toEqual([]);
  });

  test("removes stale JSON files when a schema root is dropped", () => {
    const root = makeTempProject();
    writeSrcFile(
      root,
      "src/commands/demo/types.ts",
      `/** @sg */
export interface DemoInput {
  id: string;
}
/** @sg */
export interface DemoOutput {
  ok: boolean;
}
`,
    );

    runSchemagen({ projectRoot: root });
    const generatedDir = join(root, "src/commands/demo/__generated__");
    expect(existsSync(join(generatedDir, "DemoInputSchema.json"))).toBe(true);
    expect(existsSync(join(generatedDir, "DemoOutputSchema.json"))).toBe(true);

    writeSrcFile(
      root,
      "src/commands/demo/types.ts",
      `/** @sg */
export interface DemoOutput {
  ok: boolean;
}
`,
    );

    runSchemagen({ projectRoot: root });
    expect(existsSync(join(generatedDir, "DemoInputSchema.json"))).toBe(false);
    expect(existsSync(join(generatedDir, "DemoOutputSchema.json"))).toBe(true);
    expect(existsSync(join(generatedDir, "index.ts"))).toBe(true);
  });

  test("removes orphan __generated__ when no roots remain in directory", () => {
    const root = makeTempProject();
    const generatedDir = join(root, "src/orphan/__generated__");
    mkdirSync(generatedDir, { recursive: true });
    writeFileSync(join(generatedDir, "DemoOutputSchema.json"), "{}\n");
    writeFileSync(join(generatedDir, "index.ts"), "export const DemoOutputSchema = {};\n");

    runSchemagen({ projectRoot: root });
    expect(existsSync(generatedDir)).toBe(false);
  });

  test("errors on duplicate typeName across files", () => {
    const root = makeTempProject();
    writeSrcFile(
      root,
      "src/a/types.ts",
      `/** @sg */
export interface DupType {
  a: string;
}
`,
    );
    writeSrcFile(
      root,
      "src/b/types.ts",
      `/** @sg */
export interface DupType {
  b: string;
}
`,
    );

    expect(() => discoverSchemaRoots(root)).toThrow("duplicate schema root type DupType");
  });
});
