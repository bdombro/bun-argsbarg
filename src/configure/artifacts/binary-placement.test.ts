/*
Tests for install/binary-placement module behavior.
*/

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../../core/types.ts";
import { isAppInstalled, isExternallyManagedBinary, resolvePathCommand } from "./binary-placement.ts";

const program: CliProgram = {
  key: "placementapp",
  version: "1.0.0",
  description: "x",
  handler: () => {},
};

let tmp: string;
let prevPath: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "argsbarg-placement-"));
  prevPath = process.env.PATH;
});

afterEach(() => {
  if (prevPath === undefined) delete process.env.PATH;
  else process.env.PATH = prevPath;
  rmSync(tmp, { recursive: true, force: true });
});

/** Tests for isExternallyManagedBinary. */
describe("isExternallyManagedBinary", () => {
  test("false when command is not on PATH", () => {
    process.env.PATH = tmp;
    expect(isExternallyManagedBinary("placementapp-not-on-path")).toBe(false);
  });

  test("true when PATH resolves to execPath", () => {
    const bin = join(tmp, "placementapp");
    writeFileSync(bin, "#!/bin/sh\n", "utf8");
    chmodSync(bin, 0o755);
    process.env.PATH = tmp;
    expect(isExternallyManagedBinary("placementapp", bin)).toBe(true);
  });

  test("true when PATH entry is a symlink to execPath", () => {
    const bin = join(tmp, "placementapp");
    const target = join(tmp, "real-binary");
    writeFileSync(target, "fake", "utf8");
    symlinkSync(target, bin);
    process.env.PATH = tmp;
    expect(isExternallyManagedBinary("placementapp", target)).toBe(true);
  });

  test("false when PATH points at a different binary", () => {
    const bin = join(tmp, "placementapp");
    const other = join(tmp, "other");
    writeFileSync(bin, "a", "utf8");
    writeFileSync(other, "b", "utf8");
    process.env.PATH = tmp;
    expect(isExternallyManagedBinary("placementapp", other)).toBe(false);
  });
});

/** Tests for isAppInstalled. */
describe("isAppInstalled", () => {
  /** Tests that true when externally managed. */
  test("true when externally managed", () => {
    const bin = join(tmp, program.key);
    const prevExec = process.execPath;
    writeFileSync(bin, "x", "utf8");
    chmodSync(bin, 0o755);
    process.env.PATH = tmp;
    process.execPath = bin;
    try {
      expect(isAppInstalled(program)).toBe(true);
    } finally {
      process.execPath = prevExec;
    }
  });

  /** Tests that false when not on PATH and no local copy. */
  test("false when not on PATH and no local copy", () => {
    const home = mkdtempSync(join(tmpdir(), "argsbarg-placement-home-"));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    process.env.PATH = tmp;
    try {
      expect(isAppInstalled(program)).toBe(false);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      rmSync(home, { recursive: true, force: true });
    }
  });
});

/** Tests for resolvePathCommand. */
describe("resolvePathCommand", () => {
  test("returns undefined when missing", () => {
    process.env.PATH = tmp;
    expect(resolvePathCommand("missing-cmd")).toBeUndefined();
  });
});
