/*
Tests for cli-tool/create module behavior.
*/

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  applyCreate,
  type CreateOptions,
  classNameFromKey,
  DEV_ONLY_MARKER,
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
  test("in-repo example templates match their own create output", () => {
    for (const example of ["cli", "api", "agent-plugin", "homebrew"]) {
      const dir = join(import.meta.dirname, "../../examples", example);
      assert.deepEqual({ example, drift: diffCreate(dir, { check: true }) }, { example, drift: [] });
    }
  });

  test("drops argsbarg-dev-only lines outside the in-repo template", () => {
    const content = `setup:\n    bun install\n    ln -sf a b ${DEV_ONLY_MARKER}: fix link\n    just check\n`;
    assert.equal(substituteTemplateContent(content, baseOpts()), "setup:\n    bun install\n    just check\n");
    assert.equal(substituteTemplateContent(content, baseOpts({ devTemplate: true })), content);
  });

  test("substitutes {key} tokens", () => {
    const out = substituteTemplateContent("key={key} repo={releaseRepo} desc={desc}", {
      ...baseOpts({ key: "my-cli", releaseRepo: "org/my-cli", desc: "My CLI" }),
    });
    assert.equal(out, "key=my-cli repo=org/my-cli desc=My CLI");
  });

  test("classNameFromKey", () => {
    assert.equal(classNameFromKey("sqsp-i18n"), "SqspI18n");
    assert.equal(classNameFromKey("at1"), "At1");
    assert.equal(classNameFromKey("1password"), "App1password");
  });

  test("resolveCreateOptions derives identity defaults from key", () => {
    const opts = resolveCreateOptions({ key: "at1", releaseRepo: "bdombro/at1" });
    assert.equal(opts.desc, "at1 CLI");
    assert.equal(opts.templateId, "cli");
  });

  test("resolveCreateOptions requires release repo", () => {
    assert.throws(() => resolveCreateOptions({ key: "at1" }), /release repo/i);
  });

  test("renderCreateTree for the npm cli template has a justfile and no Homebrew files", () => {
    const tree = renderCreateTree(baseOpts({ key: "testapp" }));
    assert.equal(tree.has("src/create-identity.ts"), true);
    assert.equal(tree.has("skills/testapp/SKILL.md"), true);
    assert.ok(tree.has("justfile"));
    assert.equal(
      [...tree.keys()].some((rel) => rel.startsWith("Formula/")),
      false,
    );
    const identity = tree.get("src/create-identity.ts");
    assert.ok((identity ?? "").includes('key: "testapp"'));
    assert.ok((identity ?? "").includes('template: "cli"'));
    const pkg = JSON.parse(tree.get("package.json") ?? "{}") as { name: string; bin: Record<string, string> };
    assert.equal(pkg.name, "testapp");
    assert.deepEqual(pkg.bin, { testapp: "dist/index.js" });
    assert.ok(!(tree.get("package.json") ?? "").includes("file:../.."));
    assert.equal(tree.has("src/commands/render-json/command.ts"), false);
  });

  test("renderCreateTree for the homebrew template renames the formula and its class", () => {
    const tree = renderCreateTree(baseOpts({ templateId: "homebrew", key: "my-tool", releaseRepo: "org/my-tool" }));
    const formula = tree.get("Formula/my-tool.rb");
    assert.ok((formula ?? "").includes("class MyTool < Formula"));
    assert.equal(tree.has("Formula/example-homebrew.rb"), false);
    assert.ok((tree.get("justfile") ?? "").includes("org/my-tool"));
  });

  test("renderCreateTree json template includes schema demo commands", () => {
    const tree = renderCreateTree(baseOpts({ templateId: "api", key: "testapp" }));
    assert.equal(tree.has("src/commands/render-json/command.ts"), true);
    assert.equal(tree.has("src/db/index.ts"), true);
    const identity = tree.get("src/create-identity.ts");
    assert.ok((identity ?? "").includes('template: "api"'));
  });

  test("--check detects drift", () => {
    const dir = mkdtempSync(join(tmpdir(), "argsbarg-create-"));
    try {
      applyCreate(dir, baseOpts({ force: true }));
      assert.deepEqual(diffCreate(dir, { key: "testapp", templateId: "cli" }), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--check infers options from create-identity.ts", () => {
    const dir = mkdtempSync(join(tmpdir(), "argsbarg-create-"));
    try {
      applyCreate(dir, baseOpts({ force: true }));
      assert.deepEqual(diffCreate(dir, { check: true }), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--diff captures drift details", () => {
    const drifts = diffCreateDetails("/nonexistent", { key: "x", releaseRepo: "org/x" });
    assert.ok(drifts.length > 0);
  });
});
