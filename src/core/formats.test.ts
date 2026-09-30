/*
Tests for formats module behavior.
*/

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommaList, parseDate, parseDateTime, parseDurationMs, validateFormatValue } from "./formats.ts";
import { ValueFormat } from "./types.ts";

test("parseDurationMs parses minutes and hours", () => {
  assert.equal(parseDurationMs("30s"), 30_000);
  assert.equal(parseDurationMs("5m"), 5 * 60 * 1000);
  assert.equal(parseDurationMs("2h"), 2 * 60 * 60 * 1000);
  assert.equal(parseDurationMs("1d"), 24 * 60 * 60 * 1000);
});

test("parseCommaList splits and trims", () => {
  assert.deepEqual(parseCommaList("a,b"), ["a", "b"]);
  assert.deepEqual(parseCommaList(" a , b , "), ["a", "b"]);
});

test("parseDate validates calendar dates", () => {
  assert.equal(parseDate("2026-06-22"), "2026-06-22");
  assert.throws(() => parseDate("2026-02-30"));
});

test("parseDateTime normalizes to UTC ISO", () => {
  assert.equal(parseDateTime("2026-06-22T15:00:00Z"), "2026-06-22T15:00:00.000Z");
  assert.throws(() => parseDateTime("2026-06-22"));
});

test("validateFormatValue rejects invalid duration", () => {
  assert.throws(() => validateFormatValue("nope", ValueFormat.Duration));
});
