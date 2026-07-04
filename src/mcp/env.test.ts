/*
Tests for mcp/env module behavior.
*/

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyShellEnv, bootstrapMcpEnv } from "./env.ts";

const TEST_VAR = "ARGS_BARG_SHELL_ENV_TEST";

/** Tests for mcp/env. */
describe("mcp/env", () => {
  /** ApplyShellEnv merges PATH and fills missing vars. */
  test("applyShellEnv merges PATH and fills missing vars", () => {
    const prevPath = process.env.PATH;
    const prevTest = process.env[TEST_VAR];
    delete process.env[TEST_VAR];
    try {
      process.env.PATH = "/host/bin";
      applyShellEnv({
        PATH: "/shell/bin:/host/bin",
        [TEST_VAR]: "from-shell",
      });
      expect(process.env.PATH).toBe("/shell/bin:/host/bin");
      expect(process.env[TEST_VAR]).toBe("from-shell");
    } finally {
      if (prevPath === undefined) delete process.env.PATH;
      else process.env.PATH = prevPath;
      if (prevTest === undefined) delete process.env[TEST_VAR];
      else process.env[TEST_VAR] = prevTest;
    }
  });

  test("applyShellEnv does not overwrite host vars except PATH merge", () => {
    const prev = process.env.HOME;
    process.env.HOME = "/host/home";
    try {
      applyShellEnv({ HOME: "/shell/home" });
      expect(process.env.HOME).toBe("/host/home");
    } finally {
      if (prev === undefined) delete process.env.HOME;
      else process.env.HOME = prev;
    }
  });
});

/** Tests for bootstrapMcpEnv. */
describe("bootstrapMcpEnv", () => {
  let fakeShell: string;
  let prevShell: string | undefined;
  let prevTest: string | undefined;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "argsbarg-shell-env-"));
    fakeShell = join(dir, "fake-shell.sh");
    writeFileSync(
      fakeShell,
      `#!/bin/sh
if [ "$1" = "-l" ] && [ "$2" = "-c" ] && [ "$3" = "env" ]; then
  echo "${TEST_VAR}=from_fake_shell"
fi
`,
    );
    chmodSync(fakeShell, 0o755);
    prevShell = process.env.SHELL;
    prevTest = process.env[TEST_VAR];
    delete process.env[TEST_VAR];
    process.env.SHELL = fakeShell;
  });

  afterEach(() => {
    if (prevShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = prevShell;
    if (prevTest === undefined) delete process.env[TEST_VAR];
    else process.env[TEST_VAR] = prevTest;
  });

  test("defaults on when shellEnv is undefined", () => {
    bootstrapMcpEnv({});
    expect(process.env[TEST_VAR]).toBe("from_fake_shell");
  });

  test("runs when shellEnv is true", () => {
    bootstrapMcpEnv({ shellEnv: true });
    expect(process.env[TEST_VAR]).toBe("from_fake_shell");
  });

  test("uses explicit shell path when shellEnv is a string", () => {
    bootstrapMcpEnv({ shellEnv: fakeShell });
    expect(process.env[TEST_VAR]).toBe("from_fake_shell");
  });

  test("skips capture when shellEnv is false", () => {
    bootstrapMcpEnv({ shellEnv: false });
    expect(process.env[TEST_VAR]).toBeUndefined();
  });
});
