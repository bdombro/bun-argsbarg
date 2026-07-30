/*
Tests for cli-tool/create module behavior.
*/

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCreate,
  type CreateOptions,
  classNameFromKey,
  diffCreate,
  diffCreateDetails,
  renderCreateTree,
  resolveCreateOptions,
  substituteTemplateContent,
} from "./create.ts";

function baseOpts(overrides: Partial<CreateOptions> = {}): CreateOptions {
  return {
    templateId: "cli",
    key: "testapp",
    className: "Testapp",
    tap: "local/testapp",
    homepage: "https://example.com",
    releaseRepo: "example/testapp",
    desc: "Test",
    force: false,
    dryRun: false,
    check: false,
    diff: false,
    yes: false,
    devTemplate: false,
    ...overrides,
  };
}

/** Tests for argsbarg create. */
describe("argsbarg create", () => {
  test("substitutes {key} tokens", () => {
    const out = substituteTemplateContent(
      "key={key} class={className} env={envPrefix}_API_TOKEN tap={tap} org={tapOrg}",
      {
        ...baseOpts({
          key: "my-cli",
          className: "MyCli",
          tap: "org/my-cli",
          homepage: "https://github.com/org/my-cli",
          releaseRepo: "org/my-cli",
          desc: "My CLI",
        }),
      },
    );
    expect(out).toContain("my-cli");
    expect(out).toContain("MyCli");
    expect(out).toContain("MY_CLI_API_TOKEN");
    expect(out).toContain("org/my-cli");
    expect(out).not.toContain("{key}");
  });

  test("classNameFromKey", () => {
    expect(classNameFromKey("sqsp-i18n")).toBe("SqspI18n");
    expect(classNameFromKey("at1")).toBe("At1");
    expect(classNameFromKey("1password")).toBe("App1password");
  });

  test("resolveCreateOptions derives identity defaults from key", () => {
    expect(resolveCreateOptions({ key: "1password", releaseRepo: "org/1password" }).className).toBe("App1password");
    expect(resolveCreateOptions({ key: "my-cli", className: "Custom", releaseRepo: "org/my-cli" }).className).toBe(
      "Custom",
    );
    const opts = resolveCreateOptions({ key: "at1", releaseRepo: "bdombro/at1" });
    expect(opts.tap).toBe("bdombro/at1");
    expect(opts.templateId).toBe("cli");
  });

  test("resolveCreateOptions requires release repo", () => {
    expect(() => resolveCreateOptions({ key: "at1" })).toThrow(/release repo/i);
  });

  test("renderCreateTree includes justfile and create-identity for cli template", () => {
    const tree = renderCreateTree(baseOpts({ key: "testapp" }));
    expect(tree.has("justfile")).toBe(true);
    expect(tree.has("scripts/create-identity.ts")).toBe(true);
    const identity = tree.get("scripts/create-identity.ts");
    expect(identity).toContain('key: "testapp"');
    expect(identity).toContain('template: "cli"');
    expect(tree.has("src/commands/render-json/command.ts")).toBe(false);
  });

  test("renderCreateTree json template includes schemagen commands", () => {
    const tree = renderCreateTree(baseOpts({ templateId: "json", key: "testapp" }));
    expect(tree.has("src/commands/render-json/command.ts")).toBe(true);
    expect(tree.has("src/db/index.ts")).toBe(true);
    const identity = tree.get("scripts/create-identity.ts");
    expect(identity).toContain('template: "json"');
  });

  test("--check detects drift", () => {
    const dir = mkdtempSync(join(tmpdir(), "argsbarg-create-"));
    try {
      applyCreate(dir, baseOpts({ force: true }));
      expect(diffCreate(dir, { key: "testapp", className: "Testapp", templateId: "cli" })).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--check infers options from create-identity.ts", () => {
    const dir = mkdtempSync(join(tmpdir(), "argsbarg-create-"));
    try {
      applyCreate(dir, baseOpts({ force: true }));
      expect(diffCreate(dir, { check: true })).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--diff captures drift details", () => {
    const drifts = diffCreateDetails("/nonexistent", { key: "x", releaseRepo: "org/x" });
    expect(drifts.length).toBeGreaterThan(0);
  });
});
