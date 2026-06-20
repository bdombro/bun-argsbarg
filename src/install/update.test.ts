import { expect, test, beforeEach, afterEach } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cliPresentationRoot } from "../builtins/presentation.ts";
import { cliInvoke } from "../index.ts";
import type { CliProgram, CliUpdateArtifact } from "../types.ts";
import { cliValidateProgram } from "../validate.ts";
import { parseInstallOpts, runInstallMutation } from "./index.ts";

let home: string;
let prevHome: string | undefined;
let prevExecPath: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "argsbarg-update-"));
  prevHome = process.env.HOME;
  process.env.HOME = home;
  prevExecPath = process.execPath;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  process.execPath = prevExecPath;
  rmSync(home, { recursive: true, force: true });
});

function fixtureWithUpdate(hook: () => Promise<CliUpdateArtifact>): CliProgram {
  return {
    key: "testapp",
    version: "1.0.0",
    description: "Test",
    install: { updateGetLatest: hook },
    commands: [{ key: "run", description: "Run", handler: () => {} }],
  };
}

test("update reserved when updateGetLatest is set", () => {
  const root: CliProgram = {
    ...fixtureWithUpdate(async () => ({ path: process.execPath })),
    commands: [{ key: "update", description: "conflict", handler: () => {} }],
  };
  expect(() => cliValidateProgram(root)).toThrow(/Reserved command name: update/);
});

test("presentation includes update builtin when hook is set", () => {
  const root = fixtureWithUpdate(async () => ({ path: process.execPath }));
  const presentation = cliPresentationRoot(root);
  expect(presentation.commands.some((c) => c.key === "update")).toBe(true);
});

test("parseInstallOpts maps deprecated --update to reinstall", () => {
  const opts = parseInstallOpts({ update: "1" });
  expect(opts.reinstall).toBe(true);
});

test("runInstallMutation honors --from for binary copy", async () => {
  const root: CliProgram = {
    key: "testapp",
    version: "1.0.0",
    description: "Test",
    handler: () => {},
  };
  const source = join(home, "new-binary");
  writeFileSync(source, "#!/bin/sh\necho hi\n", "utf8");
  chmodSync(source, 0o755);

  const { changed } = await runInstallMutation(root, {
    reinstall: "1",
    yes: "1",
    quiet: "1",
    from: source,
  });

  const dest = join(home, ".local", "bin", "testapp");
  expect(changed).toContain(dest);
  expect(readFileSync(dest, "utf8")).toContain("echo hi");
});

test("cliInvoke update uses hook and reinstalls", async () => {
  const source = join(home, "new-binary");
  writeFileSync(source, "#!/bin/sh\necho hi\n", "utf8");
  chmodSync(source, 0o755);

  const root = fixtureWithUpdate(async () => ({
    path: source,
    version: "2.0.0",
  }));

  const result = await cliInvoke(root, ["update"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Updated testapp 1.0.0 → 2.0.0");
  expect(existsSync(join(home, ".local", "bin", "testapp"))).toBe(true);
});

test("cliInvoke update reports already current", async () => {
  const root = fixtureWithUpdate(async () => ({
    path: process.execPath,
    version: "1.0.0",
  }));

  const result = await cliInvoke(root, ["update"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Already at v1.0.0");
});
