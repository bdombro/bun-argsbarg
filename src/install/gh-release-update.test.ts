import { expect, test } from "bun:test";
import { isAlreadyCurrent, parseReleaseTag } from "./gh-release-update.ts";

test("parseReleaseTag strips leading v", () => {
  expect(parseReleaseTag("v1.4.3")).toBe("1.4.3");
});

test("parseReleaseTag leaves bare semver unchanged", () => {
  expect(parseReleaseTag("1.4.3")).toBe("1.4.3");
});

test("parseReleaseTag throws on empty tag", () => {
  expect(() => parseReleaseTag("")).toThrow("Release tag is empty");
});

test("isAlreadyCurrent returns true when versions match", () => {
  expect(isAlreadyCurrent("1.4.3", "1.4.3")).toBe(true);
});

test("isAlreadyCurrent returns false when versions differ", () => {
  expect(isAlreadyCurrent("1.4.2", "1.4.3")).toBe(false);
});
