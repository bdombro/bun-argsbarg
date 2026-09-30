/*
Tests for builtins/builtins module behavior.
*/

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AppSpec } from "../core/types.ts";
import { resolveHttpServeConfig, resolveMcpServeConfig } from "../server/overrides.ts";
import { exportPresentationBuiltins } from "./export.ts";
import { completionBashScript, completionFishScript, completionZshScript } from "./index.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliPresentationRoot } from "./presentation.ts";

const fixture: AppSpec = {
  key: "myapp",
  version: "0.0.0",
  description: "Demo app.",
  mcpServer: { enabled: true },
  commands: [
    {
      key: "hello",
      description: "Say hello.",
      handler: () => {},
    },
  ],
};

/** Tests for builtins help copy. */
describe("builtins help copy", () => {
  test("mcp builtin description is user-facing", () => {
    const mcp = cliBuiltinMcpCommand(fixture);
    assert.ok(mcp.description.includes("MCP server"));
    assert.ok(!(mcp.notes ?? "").includes("configure"));
    assert.ok(!(mcp.notes ?? "").includes("docs mcp"));
  });
});

/** Tests for presentation root. */
describe("presentation root", () => {
  test("includes mcp and omits removed builtins", () => {
    const root = cliPresentationRoot(fixture);
    const keys = root.commands?.map((c) => c.key) ?? [];
    assert.ok(keys.includes("mcp"));
    assert.ok(!keys.includes("configure"));
    assert.ok(!keys.includes("completion"));
    assert.ok(!keys.includes("install"));
  });

  test("includes version builtin", () => {
    const root = cliPresentationRoot(fixture);
    assert.ok((root.commands?.map((c) => c.key) ?? []).includes("version"));
  });
});

/** Tests for completion emitters. */
describe("completion emitters", () => {
  test("fish script references app key and subcommands", () => {
    const schema = cliPresentationRoot(fixture);
    const fish = completionFishScript(schema);
    assert.ok(fish.includes("complete -c myapp"));
    assert.ok(fish.includes("hello"));
  });

  test("bash script includes app commands", () => {
    const schema = cliPresentationRoot(fixture);
    const bash = completionBashScript(schema);
    assert.ok(bash.includes("hello"));
    assert.ok(bash.includes("mcp"));
  });

  test("zsh script registers compdef", () => {
    const schema = cliPresentationRoot({
      key: "zapp",
      version: "0.0.0",
      description: "z",
      handler: () => {},
    });
    const zsh = completionZshScript(schema);
    assert.ok(zsh.includes("#compdef zapp"));
    assert.ok(zsh.includes("compdef _zapp zapp"));
  });
});

/** Tests for schema export builtins. */
describe("schema export builtins", () => {
  test("exportPresentationBuiltins omits hidden completion", () => {
    const builtins = exportPresentationBuiltins(fixture);
    assert.ok(!builtins.map((b) => b.key).includes("completion"));
  });
});

/** Verifies `cli.completions` hides a command from every shell's completion script but not from help. */
test("cli.completions hides commands from completions", () => {
  const spec: AppSpec = {
    key: "myapp",
    version: "0.0.0",
    description: "Demo app.",
    commands: [
      { key: "visible", description: "Shown.", handler: () => {} },
      { key: "secretcmd", description: "Not completed.", cli: { completions: { hidden: true } }, handler: () => {} },
    ],
  };
  const root = cliPresentationRoot(spec);
  for (const script of [completionBashScript(root), completionZshScript(root), completionFishScript(root)]) {
    assert.ok(script.includes("visible"));
    assert.ok(!script.includes("secretcmd"));
  }
});

/** Verifies HTTP and MCP serve configs keep `log.enrich` / `log.serialize` and expand `~` in `log.file`. */
test("serve configs keep log hooks and expand ~ in log.file", () => {
  const enrich = () => ({ team: "qa" });
  const serialize = () => "line";
  const spec: AppSpec = {
    key: "myapp",
    version: "0.0.0",
    description: "Demo app.",
    httpServer: { enabled: true },
    mcpServer: { enabled: true },
    log: { enrich, serialize, file: "~/logs/app.log" },
    commands: [{ key: "hello", description: "Hi.", handler: () => {} }],
  };
  for (const log of [resolveHttpServeConfig(spec).log, resolveMcpServeConfig(spec).log]) {
    assert.equal(log.enrich, enrich);
    assert.equal(log.serialize, serialize);
    assert.ok(log.file && !log.file.startsWith("~") && log.file.endsWith("/logs/app.log"));
  }
  assert.equal(resolveHttpServeConfig(spec, { noAccessLog: true }).log.access, false);
});
