/*
Tests for paths/host module behavior.
*/

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { userHome } from "./host.ts";

describe("userHome", () => {
  let prevTestHome: string | undefined;

  afterEach(() => {
    if (prevTestHome === undefined) delete process.env.TEST_USER_HOME;
    else process.env.TEST_USER_HOME = prevTestHome;
  });

  test("uses TEST_USER_HOME when set", () => {
    const home = mkdtempSync(join(tmpdir(), "argsbarg-test-home-"));
    prevTestHome = process.env.TEST_USER_HOME;
    process.env.TEST_USER_HOME = home;
    try {
      expect(userHome()).toBe(home);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("ignores sandboxed HOME (Homebrew post_install)", () => {
    prevTestHome = process.env.TEST_USER_HOME;
    delete process.env.TEST_USER_HOME;
    const prevHome = process.env.HOME;
    process.env.HOME = "/private/tmp/sqsp-workspaces-postinstall-20260807-fake";
    try {
      const resolved = userHome();
      expect(resolved).not.toBe(process.env.HOME);
      if (process.platform === "darwin" && process.env.USER) {
        expect(resolved).toBe(`/Users/${process.env.USER}`);
        expect(existsSync(resolved)).toBe(true);
      } else {
        expect(resolved).toBe(userInfo().homedir);
      }
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  test("resolves macOS default home when TEST_USER_HOME unset", () => {
    prevTestHome = process.env.TEST_USER_HOME;
    delete process.env.TEST_USER_HOME;
    if (process.platform !== "darwin" || !process.env.USER) return;
    const expected = `/Users/${process.env.USER}`;
    if (!existsSync(expected)) return;
    expect(userHome()).toBe(expected);
  });
});
