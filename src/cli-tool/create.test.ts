/*
Tests for cli-tool/create module behavior.
*/

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCreate,
  classNameFromKey,
  diffCreate,
  diffCreateDetails,
  renderCreateTree,
  resolveCreateOptions,
  substituteTemplateContent,
} from "./create.ts";

/** Tests for argsbarg create. */
describe("argsbarg create", () => {
  /** Tests that substitutes {key} tokens. */
  test("substitutes {key} tokens", () => {
    const out = substituteTemplateContent(
      "key={key} class={className} env={envPrefix}_API_TOKEN tap={tap} org={tapOrg}",
      {
        key: "my-cli",
        className: "MyCli",
        tap: "org/my-cli",
        homepage: "https://github.com/org/my-cli",
        releaseRepo: "org/my-cli",
        desc: "My CLI",
        force: false,
        dryRun: false,
        check: false,
        diff: false,
        yes: false,
        devTemplate: false,
      },
    );
    expect(out).toContain("my-cli");
    expect(out).toContain("MyCli");
    expect(out).toContain("MY_CLI_API_TOKEN");
    expect(out).toContain("org/my-cli");
    expect(out).not.toContain("{key}");
  });

  /** Tests that classNameFromKey. */
  test("classNameFromKey", () => {
    expect(classNameFromKey("sqsp-i18n")).toBe("SqspI18n");
    expect(classNameFromKey("at1")).toBe("At1");
    expect(classNameFromKey("1password")).toBe("App1password");
  });

  /** ResolveCreateOptions derives identity defaults from key. */
  test("resolveCreateOptions derives identity defaults from key", () => {
    expect(resolveCreateOptions({ key: "1password", releaseRepo: "org/1password" }).className).toBe(
      "App1password",
    );
    expect(
      resolveCreateOptions({ key: "my-cli", className: "Custom", releaseRepo: "org/my-cli" })
        .className,
    ).toBe("Custom");
    const opts = resolveCreateOptions({ key: "at1", releaseRepo: "bdombro/at1" });
    expect(opts.tap).toBe("bdombro/at1");
    expect(opts.releaseRepo).toBe("bdombro/at1");
    expect(opts.homepage).toBe("https://github.com/bdombro/at1");
    expect(opts.desc).toBe("At1 CLI");
  });

  /** ResolveCreateOptions requires release repo. */
  test("resolveCreateOptions requires release repo", () => {
    expect(() => resolveCreateOptions({ key: "at1" })).toThrow(/release repo/i);
  });

  /** Tests that renderCreateTree includes justfile and create-identity. */
  test("renderCreateTree includes justfile and create-identity", () => {
    const tree = renderCreateTree({
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
    });
    expect(tree.has("justfile")).toBe(true);
    expect(tree.has("biome.json")).toBe(true);
    expect(tree.has(".cursor/rules/code.mdc")).toBe(true);
    expect(tree.has("scripts/create-identity.ts")).toBe(true);
    const identity = tree.get("scripts/create-identity.ts");
    expect(identity).toContain('key: "testapp"');
    const formula = tree.get("scripts/formula-shared.ts");
    expect(formula).toContain("create-identity.ts");
  });

  /** Tests that --check detects drift. */
  test("--check detects drift", () => {
    const dir = mkdtempSync(join(tmpdir(), "argsbarg-create-"));
    try {
      applyCreate(dir, {
        key: "testapp",
        className: "Testapp",
        tap: "local/testapp",
        homepage: "https://example.com",
        releaseRepo: "example/testapp",
        desc: "Test",
        force: true,
        dryRun: false,
        check: false,
        diff: false,
        yes: false,
        devTemplate: false,
      });
      expect(diffCreate(dir, { key: "testapp", className: "Testapp" })).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** Tests that --check infers options from create-identity.ts. */
  test("--check infers options from create-identity.ts", () => {
    const dir = mkdtempSync(join(tmpdir(), "argsbarg-create-"));
    try {
      applyCreate(dir, {
        key: "testapp",
        className: "Testapp",
        tap: "local/testapp",
        homepage: "https://example.com",
        releaseRepo: "example/testapp",
        desc: "Test",
        force: true,
        dryRun: false,
        check: false,
        diff: false,
        yes: false,
        devTemplate: false,
      });
      expect(diffCreate(dir, { check: true })).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** Tests that --diff captures drift details. */
  test("--diff captures drift details", () => {
    const drifts = diffCreateDetails("/nonexistent", { key: "x", releaseRepo: "org/x" });
    expect(drifts.length).toBeGreaterThan(0);
  });
});
