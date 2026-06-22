import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cliPresentationRoot, cliParseRoot } from "./builtins/presentation.ts";
import { exportPresentationBuiltins } from "./builtins/export.ts";
import { cliHelpRender } from "./help.ts";
import { cliSchemaExport } from "./schema.ts";
import { collectMcpTools } from "./mcp/tools.ts";
import { defaultMcpBundlePaths, generateMcpManifest, packMcpBundle } from "./mcp/bundle.ts";
import { CliOptionKind, type CliProgram } from "./types.ts";

const hiddenFixture: CliProgram = {
  key: "myapp",
  version: "1.0.0",
  description: "Hidden demo.",
  mcpServer: { enabled: true },
  commands: [
    {
      key: "public",
      description: "Visible command.",
      handler: () => {},
    },
    {
      key: "secret",
      hidden: true,
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
          kind: CliOptionKind.Presence,
        },
        {
          name: "secret-flag",
          hidden: true,
          description: "Hidden option.",
          kind: CliOptionKind.Presence,
        },
      ],
      handler: () => {},
    },
  ],
};

describe("hidden commands and options", () => {
  test("parse root includes hidden commands", () => {
    const parse = cliParseRoot(hiddenFixture);
    expect(parse.commands?.map((c) => c.key)).toContain("secret");
  });

  test("presentation root omits hidden commands", () => {
    const presentation = cliPresentationRoot(hiddenFixture);
    const keys = presentation.commands?.map((c) => c.key) ?? [];
    expect(keys).toContain("public");
    expect(keys).not.toContain("secret");
  });

  test("root help omits hidden commands", () => {
    const help = cliHelpRender(cliParseRoot(hiddenFixture), [], false);
    expect(help).toContain("public");
    expect(help).not.toContain("secret");
  });

  test("hidden command -h still works", () => {
    const help = cliHelpRender(cliParseRoot(hiddenFixture), ["secret"], false);
    expect(help).toContain("Hidden command.");
  });

  test("help omits hidden options", () => {
    const help = cliHelpRender(cliParseRoot(hiddenFixture), ["flags"], false);
    expect(help).toContain("--visible");
    expect(help).not.toContain("secret-flag");
  });

  test("schema export omits hidden nodes and options", () => {
    const schema = cliSchemaExport(hiddenFixture);
    const keys = schema.commands?.map((c) => c.key) ?? [];
    expect(keys).toContain("public");
    expect(keys).not.toContain("secret");
    const flags = schema.commands?.find((c) => c.key === "flags");
    expect(flags?.options?.map((o) => o.name)).toEqual(["visible"]);
  });

  test("MCP tools omit hidden commands", () => {
    const tools = collectMcpTools(hiddenFixture);
    expect(tools.map((t) => t.name)).toEqual(["public", "flags"]);
  });
});

describe("mcp router", () => {
  test("presentation exposes mcp bundle but not hidden serve", () => {
    const builtins = exportPresentationBuiltins(hiddenFixture);
    const mcp = builtins.find((b) => b.key === "mcp");
    expect(mcp).toBeDefined();
    expect(mcp?.commands?.map((c) => c.key)).toEqual(["bundle"]);
    expect(mcp?.fallbackCommand).toBe("serve");
  });

  test("mcp help lists bundle", () => {
    const help = cliHelpRender(cliParseRoot(hiddenFixture), ["mcp"], false);
    expect(help).toContain("bundle");
    expect(help).not.toMatch(/│ serve\s/);
  });
});

describe("mcp bundle", () => {
  test("generateMcpManifest uses mcpServerId and binary entry", () => {
    const manifest = generateMcpManifest(hiddenFixture, "myapp");
    expect(manifest.name).toBe("myapp");
    expect(manifest.manifest_version).toBe("0.3");
    expect((manifest.server as { type: string }).type).toBe("binary");
    expect((manifest.server as { entry_point: string }).entry_point).toBe("myapp");
    const mcpConfig = (manifest.server as { mcp_config: { command: string; args: string[] } }).mcp_config;
    expect(mcpConfig.command).toBe("${__dirname}/myapp");
    expect(mcpConfig.args).toEqual(["mcp"]);
    expect((manifest.compatibility as { platforms: string[] }).platforms).toEqual(["darwin"]);
  });

  test("defaultMcpBundlePaths", () => {
    const cwd = "/tmp/work";
    const paths = defaultMcpBundlePaths(hiddenFixture, cwd);
    expect(paths.binaryPath).toBe(join(cwd, "dist", "myapp"));
    expect(paths.outPath).toBe(join(cwd, "dist", "myapp.mcpb"));
  });

  test("packMcpBundle writes zip with manifest and binary", () => {
    const work = mkdtempSync(join(tmpdir(), "mcpb-test-"));
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      const binaryPath = join(dist, "myapp");
      writeFileSync(binaryPath, "#!/bin/sh\necho hi\n", { mode: 0o755 });

      const outPath = packMcpBundle(hiddenFixture, { cwd: work });
      expect(outPath).toBe(join(dist, "myapp.mcpb"));

      const zip = readFileSync(outPath);
      expect(zip.length).toBeGreaterThan(0);
      expect(zip.indexOf(Buffer.from("manifest.json"))).toBeGreaterThanOrEqual(0);
      expect(zip.indexOf(Buffer.from("myapp"))).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
