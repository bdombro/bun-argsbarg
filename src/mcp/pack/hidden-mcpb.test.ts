/*
Tests for hidden-mcpb module behavior.
*/

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { exportPresentationBuiltins } from "../../builtins/export.ts";
import { cliParseRoot, cliPresentationRoot } from "../../builtins/presentation.ts";
import { schemaExport } from "../../core/schema.ts";
import { type AppSpec, OptionKind } from "../../core/types.ts";
import { cliHelpRender } from "../../runtime/help.ts";
import { collectMcpTools } from "../tools.ts";
import { defaultMcpBundlePaths, generateMcpManifest, packMcpBundle, runMcpBundle } from "./bundle.ts";

const hiddenFixture: AppSpec = {
  key: "myapp",
  version: "1.0.0",
  description: "Hidden demo.",
  mcpServer: { enabled: true, mcpd: true, claudePlugin: true },
  commands: [
    {
      key: "public",
      description: "Visible command.",
      handler: () => {},
    },
    {
      key: "secret",
      cli: { hidden: true },
      mcpTool: { hidden: true },
      description: "Hidden command.",
      handler: () => {},
    },
    {
      key: "flags",
      description: "Command with hidden option.",
      options: [
        {
          name: "visible",
          description: "Shown in help.",
          kind: OptionKind.Presence,
        },
        {
          name: "secret-flag",
          cli: { hidden: true },
          description: "Hidden option.",
          kind: OptionKind.Presence,
        },
      ],
      handler: () => {},
    },
  ],
};

/** Tests for hidden commands and options. */
describe("hidden commands and options", () => {
  test("parse root includes hidden commands", () => {
    const parse = cliParseRoot(hiddenFixture);
    assert.ok((parse.commands?.map((c) => c.key) ?? []).includes("secret"));
  });

  test("presentation root omits hidden commands", () => {
    const presentation = cliPresentationRoot(hiddenFixture);
    const keys = presentation.commands?.map((c) => c.key) ?? [];
    assert.ok(keys.includes("public"));
    assert.ok(!keys.includes("secret"));
  });

  test("root help omits hidden commands", () => {
    const help = cliHelpRender(cliParseRoot(hiddenFixture), [], false);
    assert.ok(help.includes("public"));
    assert.ok(!help.includes("secret"));
  });

  test("hidden command -h still works", () => {
    const help = cliHelpRender(cliParseRoot(hiddenFixture), ["secret"], false);
    assert.ok(help.includes("Hidden command."));
  });

  test("help omits hidden options", () => {
    const help = cliHelpRender(cliParseRoot(hiddenFixture), ["flags"], false);
    assert.ok(help.includes("--visible"));
    assert.ok(!help.includes("secret-flag"));
  });

  test("schema export omits hidden nodes and options", () => {
    const schema = schemaExport(hiddenFixture);
    const keys = schema.commands?.map((c) => c.key) ?? [];
    assert.ok(keys.includes("public"));
    assert.ok(!keys.includes("secret"));
    const flags = schema.commands?.find((c) => c.key === "flags");
    assert.deepEqual(
      flags?.options?.map((o) => o.name),
      ["visible"],
    );
  });

  test("MCP tools omit hidden commands", () => {
    const tools = collectMcpTools(hiddenFixture);
    assert.deepEqual(
      tools.map((t) => t.name),
      ["flags", "public"],
    );
  });
});

/** Tests for mcp router. */
describe("mcp router", () => {
  test("presentation exposes mcp bundle but not hidden serve", () => {
    const builtins = exportPresentationBuiltins(hiddenFixture);
    const mcp = builtins.find((b) => b.key === "mcp");
    assert.notEqual(mcp, undefined);
    assert.deepEqual(
      mcp?.commands?.map((c) => c.key),
      ["bundle"],
    );
    assert.equal(mcp?.fallbackCommand, "serve");
  });

  test("mcp help lists bundle", () => {
    const help = cliHelpRender(cliParseRoot(hiddenFixture), ["mcp"], false);
    assert.ok(help.includes("bundle"));
    assert.doesNotMatch(help, /│ serve\s/);
  });
});

/** Tests for mcp bundle. */
describe("mcp bundle", () => {
  test("generateMcpManifest uses mcpServerId and binary entry", () => {
    const manifest = generateMcpManifest(hiddenFixture, "myapp");
    assert.equal(manifest.name, "myapp");
    assert.equal(manifest.manifest_version, "0.3");
    assert.equal((manifest.server as { type: string }).type, "binary");
    assert.equal((manifest.server as { entry_point: string }).entry_point, "myapp");
    const mcpConfig = (manifest.server as { mcp_config: { command: string; args: string[] } }).mcp_config;
    assert.equal(mcpConfig.command, "${__dirname}/myapp");
    assert.deepEqual(mcpConfig.args, ["mcp"]);
    assert.deepEqual((manifest.compatibility as { platforms: string[] }).platforms, ["darwin"]);
  });

  test("defaultMcpBundlePaths", () => {
    const cwd = "/tmp/work";
    const paths = defaultMcpBundlePaths(hiddenFixture, cwd);
    assert.equal(paths.binaryPath, join(cwd, "dist", "myapp"));
    assert.equal(paths.outPath, join(cwd, "dist", "myapp.mcpb"));
  });

  /** Tests that packMcpBundle writes zip with manifest and binary. */
  test("packMcpBundle writes zip with manifest and binary", () => {
    const work = mkdtempSync(join(tmpdir(), "mcpb-test-"));
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      const binaryPath = join(dist, "myapp");
      writeFileSync(binaryPath, "#!/bin/sh\necho hi\n", { mode: 0o755 });

      const outPath = packMcpBundle(hiddenFixture, { cwd: work });
      assert.equal(outPath, join(dist, "myapp.mcpb"));

      const zip = readFileSync(outPath);
      assert.ok(zip.length > 0);
      assert.ok(zip.indexOf(Buffer.from("manifest.json")) >= 0);
      assert.ok(zip.indexOf(Buffer.from("myapp")) >= 0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  /** RunMcpBundle prints mcpb and plugin paths. */
  test("runMcpBundle prints mcpb and plugin paths", () => {
    const work = mkdtempSync(join(tmpdir(), "mcpb-run-"));
    const stdout: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write;
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, "myapp"), "#!/bin/sh\n", { mode: 0o755 });
      const prevCwd = process.cwd();
      process.chdir(work);
      try {
        runMcpBundle(hiddenFixture);
      } finally {
        process.chdir(prevCwd);
      }
      const lines = stdout.join("").trim().split("\n");
      const norm = (p: string) => realpathSync.native(p);
      assert.deepEqual(lines.map(norm), [
        norm(join(dist, "myapp.mcpb")),
        norm(join(dist, "claude-plugin", "myapp.zip")),
      ]);
      const zip = readFileSync(join(dist, "claude-plugin", "myapp.zip"));
      assert.ok(zip.indexOf(Buffer.from(".mcp.json")) >= 0);
    } finally {
      process.stdout.write = orig;
      rmSync(work, { recursive: true, force: true });
    }
  });

  /** RunMcpBundle with claudePlugin only prints plugin path. */
  test("runMcpBundle with claudePlugin only prints plugin path", () => {
    const work = mkdtempSync(join(tmpdir(), "mcpb-run-"));
    const stdout: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write;
    const fixture: AppSpec = {
      ...hiddenFixture,
      mcpServer: { enabled: true, claudePlugin: true },
    };
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, "myapp"), "#!/bin/sh\n", { mode: 0o755 });
      const prevCwd = process.cwd();
      process.chdir(work);
      try {
        runMcpBundle(fixture);
      } finally {
        process.chdir(prevCwd);
      }
      const lines = stdout.join("").trim().split("\n");
      assert.equal(lines.length, 1);
      assert.ok(lines[0].includes("claude-plugin"));
    } finally {
      process.stdout.write = orig;
      rmSync(work, { recursive: true, force: true });
    }
  });

  /** RunMcpBundle with cursorPlugin only prints plugin path. */
  test("runMcpBundle with cursorPlugin only prints plugin path", () => {
    const work = mkdtempSync(join(tmpdir(), "mcpb-run-cursor-"));
    const stdout: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write;
    const fixture: AppSpec = {
      ...hiddenFixture,
      mcpServer: { enabled: true, cursorPlugin: true },
    };
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, "myapp"), "#!/bin/sh\n", { mode: 0o755 });
      const prevCwd = process.cwd();
      process.chdir(work);
      try {
        runMcpBundle(fixture);
      } finally {
        process.chdir(prevCwd);
      }
      const lines = stdout.join("").trim().split("\n");
      assert.equal(lines.length, 1);
      assert.ok(lines[0].includes("cursor-plugin"));
    } finally {
      process.stdout.write = orig;
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("runMcpBundle errors when no bundle flags enabled", () => {
    const fixture: AppSpec = {
      ...hiddenFixture,
      mcpServer: { enabled: true },
    };
    assert.throws(() => runMcpBundle(fixture), /cursorPlugin/);
  });
});
