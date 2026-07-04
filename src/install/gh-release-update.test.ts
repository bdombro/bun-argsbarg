/*
Tests for install/gh-release-update module behavior.
*/

import { expect, test } from "bun:test";
import { isAlreadyCurrent, parseReleaseTag } from "./gh-release-update.ts";

/** ParseReleaseTag strips leading v. */
test("parseReleaseTag strips leading v", () => {
  expect(parseReleaseTag("v1.4.3")).toBe("1.4.3");
});

/** ParseReleaseTag leaves bare semver unchanged. */
test("parseReleaseTag leaves bare semver unchanged", () => {
  expect(parseReleaseTag("1.4.3")).toBe("1.4.3");
});

/** ParseReleaseTag throws on empty tag. */
test("parseReleaseTag throws on empty tag", () => {
  expect(() => parseReleaseTag("")).toThrow("Release tag is empty");
});

/** Tests that isAlreadyCurrent returns true when versions match. */
test("isAlreadyCurrent returns true when versions match", () => {
  expect(isAlreadyCurrent("1.4.3", "1.4.3")).toBe(true);
});

/** Tests that isAlreadyCurrent returns false when versions differ. */
test("isAlreadyCurrent returns false when versions differ", () => {
  expect(isAlreadyCurrent("1.4.2", "1.4.3")).toBe(false);
});
