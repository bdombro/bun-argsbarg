/*
Tests for headless module behavior.
*/

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDryRunMessage,
  requireYesInNonTty,
  shouldRunHeadless,
  shouldRunHeadlessWithPositionals,
  shouldRunHeadlessWithYes,
  wantsExplicitJson,
} from "./routing.ts";

test("wantsExplicitJson includes MCP and API invocation", () => {
  assert.equal(wantsExplicitJson({ invocation: "cli" }, false), false);
  assert.equal(wantsExplicitJson({ invocation: "mcp" }, false), true);
  assert.equal(wantsExplicitJson({ invocation: "http" }, false), true);
  assert.equal(wantsExplicitJson({ invocation: "cli" }, true), true);
});

test("shouldRunHeadless is true for MCP, API, and json", () => {
  assert.equal(shouldRunHeadless({ invocation: "mcp" }, false), true);
  assert.equal(shouldRunHeadless({ invocation: "http" }, false), true);
  assert.equal(shouldRunHeadless({ invocation: "cli" }, true), true);
  assert.equal(shouldRunHeadless({ invocation: "cli" }, false, true), true);
  assert.equal(shouldRunHeadless({ invocation: "cli" }, false, false, false), true);
});

test("shouldRunHeadlessWithPositionals requires positionals in non-tty", () => {
  assert.equal(shouldRunHeadlessWithPositionals({ invocation: "cli" }, false, [], false, false), false);
  assert.equal(shouldRunHeadlessWithPositionals({ invocation: "cli" }, false, ["a"], false, false), true);
});

/** Tests that shouldRunHeadlessWithYes requires yes in non-tty. */
test("shouldRunHeadlessWithYes requires yes in non-tty", () => {
  assert.equal(shouldRunHeadlessWithYes({ invocation: "cli" }, { yes: true, hasRequiredArgs: true }, false), true);
  assert.equal(shouldRunHeadlessWithYes({ invocation: "cli" }, { yes: false, hasRequiredArgs: true }, false), false);
  assert.equal(
    shouldRunHeadlessWithYes({ invocation: "cli" }, { yes: false, hasRequiredArgs: true, dryRun: true }, false),
    true,
  );
});

test("formatDryRunMessage prefixes dry-run output", () => {
  assert.equal(formatDryRunMessage("hello", false), "hello");
  assert.equal(formatDryRunMessage("hello", true), "[DRY RUN] hello");
});

/** Tests that requireYesInNonTty exits without yes in non-tty. */
test("requireYesInNonTty exits without yes in non-tty", () => {
  const originalExit = process.exit;
  let code: number | undefined;
  process.exit = ((c?: number) => {
    code = c ?? 0;
    throw new Error("exit");
  }) as typeof process.exit;

  try {
    assert.throws(
      () => {
        requireYesInNonTty(false, "hint", false, false);
      },
      (err: unknown) => String((err as Error)?.message ?? err).includes("exit"),
    );
    assert.equal(code, 1);
    requireYesInNonTty(false, "hint", true, false);
    requireYesInNonTty(true, "hint", false, false);
  } finally {
    process.exit = originalExit;
  }
});
