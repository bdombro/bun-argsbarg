/*
Tests for config/bindings module.
*/

import { describe, expect, test } from "bun:test";
import type { CliAppConfigEntry } from "../types.ts";
import {
  bindingForKey,
  CONFIG_BINDINGS_KEY,
  clearBinding,
  clearFileValue,
  isKeyAddressed,
  readBindings,
  setBinding,
} from "./bindings.ts";

const optionalEntry: CliAppConfigEntry = { description: "Optional.", required: false };
const requiredEntry: CliAppConfigEntry = { description: "Required.", env: "API_TOKEN" };

describe("config/bindings", () => {
  test("readBindings returns empty when absent", () => {
    expect(readBindings({})).toEqual({});
  });

  test("setBinding and readBindings round-trip", () => {
    const next = setBinding({}, "apiToken", "env");
    expect(readBindings(next)).toEqual({ apiToken: "env" });
    expect(next[CONFIG_BINDINGS_KEY]).toEqual({ apiToken: "env" });
  });

  test("clearBinding removes entry", () => {
    const withBinding = setBinding({}, "apiToken", "env");
    const cleared = clearBinding(withBinding, "apiToken");
    expect(readBindings(cleared)).toEqual({});
    expect(CONFIG_BINDINGS_KEY in cleared).toBe(false);
  });

  test("clearFileValue removes literal", () => {
    expect(clearFileValue({ apiToken: "x" }, "apiToken")).toEqual({});
  });

  test("isKeyAddressed with binding env", () => {
    const data = setBinding({}, "apiToken", "env");
    expect(isKeyAddressed("apiToken", data, requiredEntry)).toBe(true);
  });

  test("isKeyAddressed with literal file value", () => {
    expect(isKeyAddressed("apiToken", { apiToken: "tok" }, requiredEntry)).toBe(true);
  });

  test("isKeyAddressed false when unaddressed", () => {
    expect(isKeyAddressed("apiToken", {}, requiredEntry)).toBe(false);
  });

  test("isKeyAddressed skip binding", () => {
    const data = setBinding({}, "note", "skip");
    expect(isKeyAddressed("note", data, optionalEntry)).toBe(true);
  });

  test("bindingForKey prefers explicit binding", () => {
    const data = setBinding({}, "apiToken", "env");
    expect(bindingForKey("apiToken", data, true)).toBe("env");
  });

  test("bindingForKey infers file from literal", () => {
    expect(bindingForKey("apiToken", { apiToken: "x" }, true)).toBe("file");
  });

  test("bindingForKey missing when unset", () => {
    expect(bindingForKey("apiToken", {}, false)).toBe("missing");
  });
});
