import { expect, test } from "bun:test";
import {
  parseCommaList,
  parseDate,
  parseDateTime,
  parseDurationMs,
  validateFormatValue,
} from "./formats.ts";
import { CliValueFormat } from "./types.ts";

test("parseDurationMs parses minutes and hours", () => {
  expect(parseDurationMs("30s")).toBe(30_000);
  expect(parseDurationMs("5m")).toBe(5 * 60 * 1000);
  expect(parseDurationMs("2h")).toBe(2 * 60 * 60 * 1000);
  expect(parseDurationMs("1d")).toBe(24 * 60 * 60 * 1000);
});

test("parseCommaList splits and trims", () => {
  expect(parseCommaList("a,b")).toEqual(["a", "b"]);
  expect(parseCommaList(" a , b , ")).toEqual(["a", "b"]);
});

test("parseDate validates calendar dates", () => {
  expect(parseDate("2026-06-22")).toBe("2026-06-22");
  expect(() => parseDate("2026-02-30")).toThrow();
});

test("parseDateTime normalizes to UTC ISO", () => {
  expect(parseDateTime("2026-06-22T15:00:00Z")).toBe("2026-06-22T15:00:00.000Z");
  expect(() => parseDateTime("2026-06-22")).toThrow();
});

test("validateFormatValue rejects invalid duration", () => {
  expect(() => validateFormatValue("nope", CliValueFormat.Duration)).toThrow();
});
