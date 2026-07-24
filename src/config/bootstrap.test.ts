import { describe, expect, test } from "bun:test";
import type { CliAppConfigEntry } from "../core/types.ts";
import { shouldWizardPromptConfigKey } from "./bootstrap.ts";

const requiredEntry: CliAppConfigEntry = {
  description: "API token.",
  required: true,
};

describe("shouldWizardPromptConfigKey", () => {
  test("skips addressed keys by default", () => {
    expect(
      shouldWizardPromptConfigKey(
        "apiToken",
        { apiToken: "tok", _bindings: { apiToken: "file" } },
        requiredEntry,
        { apiToken: "tok" },
        {},
      ),
    ).toBe(false);
  });

  test("rePromptAll prompts addressed keys", () => {
    expect(
      shouldWizardPromptConfigKey(
        "apiToken",
        { apiToken: "tok", _bindings: { apiToken: "file" } },
        requiredEntry,
        { apiToken: "tok" },
        { rePromptAll: true },
      ),
    ).toBe(true);
  });

  test("prompts when env binding is broken", () => {
    expect(
      shouldWizardPromptConfigKey(
        "apiToken",
        { _bindings: { apiToken: "env" } },
        { ...requiredEntry, env: "API_TOKEN" },
        {},
        {},
      ),
    ).toBe(true);
  });
});
