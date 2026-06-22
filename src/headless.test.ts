import { expect, test } from "bun:test";
import {
  formatDryRunMessage,
  requireYesInNonTty,
  shouldRunHeadless,
  shouldRunHeadlessWithPositionals,
  shouldRunHeadlessWithYes,
  wantsExplicitJson,
} from "./headless.ts";

test("wantsExplicitJson includes MCP invocation", () => {
  expect(wantsExplicitJson({ invocation: "cli" }, false)).toBe(false);
  expect(wantsExplicitJson({ invocation: "mcp" }, false)).toBe(true);
  expect(wantsExplicitJson({ invocation: "cli" }, true)).toBe(true);
});

test("shouldRunHeadless is true for MCP and json", () => {
  expect(shouldRunHeadless({ invocation: "mcp" }, false)).toBe(true);
  expect(shouldRunHeadless({ invocation: "cli" }, true)).toBe(true);
  expect(shouldRunHeadless({ invocation: "cli" }, false, true)).toBe(true);
  expect(shouldRunHeadless({ invocation: "cli" }, false, false, false)).toBe(true);
});

test("shouldRunHeadlessWithPositionals requires positionals in non-tty", () => {
  expect(shouldRunHeadlessWithPositionals({ invocation: "cli" }, false, [], false, false)).toBe(
    false,
  );
  expect(shouldRunHeadlessWithPositionals({ invocation: "cli" }, false, ["a"], false, false)).toBe(
    true,
  );
});

test("shouldRunHeadlessWithYes requires yes in non-tty", () => {
  expect(
    shouldRunHeadlessWithYes({ invocation: "cli" }, { yes: true, hasRequiredArgs: true }, false),
  ).toBe(true);
  expect(
    shouldRunHeadlessWithYes({ invocation: "cli" }, { yes: false, hasRequiredArgs: true }, false),
  ).toBe(false);
  expect(
    shouldRunHeadlessWithYes(
      { invocation: "cli" },
      { yes: false, hasRequiredArgs: true, dryRun: true },
      false,
    ),
  ).toBe(true);
});

test("formatDryRunMessage prefixes dry-run output", () => {
  expect(formatDryRunMessage("hello", false)).toBe("hello");
  expect(formatDryRunMessage("hello", true)).toBe("[DRY RUN] hello");
});

test("requireYesInNonTty exits without yes in non-tty", () => {
  const originalExit = process.exit;
  let code: number | undefined;
  process.exit = ((c?: number) => {
    code = c ?? 0;
    throw new Error("exit");
  }) as typeof process.exit;

  try {
    expect(() => {
      requireYesInNonTty(false, "hint", false, false);
    }).toThrow("exit");
    expect(code).toBe(1);
    requireYesInNonTty(false, "hint", true, false);
    requireYesInNonTty(true, "hint", false, false);
  } finally {
    process.exit = originalExit;
  }
});
