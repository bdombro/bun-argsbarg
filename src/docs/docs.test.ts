/*
Tests for docs/docs module behavior.
*/

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { completionBashScript } from "../builtins/index.ts";
import { cliPresentationRoot } from "../builtins/presentation.ts";
import { ParseKind, parse } from "../core/parse.ts";
import type { CliProgram } from "../core/types.ts";
import { cliValidateProgram } from "../core/validate.ts";
import { cliHelpRender } from "../help.ts";
import { Cli } from "../index.ts";
import { resolveCapabilities, skipsRequiredAppConfigExit } from "../runtime/capabilities.ts";
import { generateMcpGuide } from "./mcp-guide.ts";
import { saveDocsTopic } from "./save.ts";

let workDir: string;
let prevCwd: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "argsbarg-docs-save-"));
  prevCwd = process.cwd();
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(prevCwd);
  rmSync(workDir, { recursive: true, force: true });
});

function docsFixture(mcp = true): CliProgram {
  return {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    mcpServer: mcp ? { enabled: true } : undefined,
    docs: {
      topics: {
        readme: { text: "# Hello README\n" },
        arch: { text: "# Architecture\n", description: "Contributor notes." },
      },
    },
    commands: [
      {
        key: "run",
        description: "Run something.",
        handler: () => {},
      },
    ],
  };
}

/** Docs reserved when enabled. */
test("docs reserved when enabled", () => {
  const root: CliProgram = {
    ...docsFixture(),
    commands: [
      {
        key: "docs",
        description: "conflict",
        handler: () => {},
      },
    ],
  };
  expect(() => cliValidateProgram(root)).toThrow(/Reserved command name: docs/);
});

/** Docs rejects reserved topic keys. */
test("docs rejects reserved topic keys", () => {
  const root = docsFixture();
  const docs = root.docs;
  if (!docs?.topics) throw new Error("expected docs fixture");
  docs.topics["cli-schema"] = { text: "nope" };
  expect(() => cliValidateProgram(root)).toThrow(/reserved/);
  delete docs.topics["cli-schema"];
  docs.topics.skill = { text: "nope" };
  expect(() => cliValidateProgram(root)).toThrow(/reserved/);
  delete docs.topics.skill;
  docs.topics.cli = { text: "nope" };
  expect(() => cliValidateProgram(root)).toThrow(/reserved/);
  delete docs.topics.cli;
  docs.topics.openapi = { text: "nope" };
  expect(() => cliValidateProgram(root)).toThrow(/reserved/);
  delete docs.topics.openapi;
  docs.topics.http = { text: "nope" };
  expect(() => cliValidateProgram(root)).toThrow(/reserved/);
});

test("docs enabled by default without docs block", () => {
  const root: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo.",
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  };
  expect(resolveCapabilities(root).docs).toBe(true);
  cliValidateProgram(root);
});

test("docs opt-out allows user command named docs", () => {
  const root: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo.",
    docs: { enabled: false },
    commands: [
      {
        key: "docs",
        description: "Custom docs.",
        handler: () => {},
      },
    ],
  };
  expect(resolveCapabilities(root).docs).toBe(false);
  cliValidateProgram(root);
});

test("built-in docs work without topics", async () => {
  const root: CliProgram = {
    key: "myapp",
    version: "1.0.0",
    description: "Demo.",
    commands: [{ key: "run", description: "Run.", handler: () => {} }],
  };
  const cliRef = await new Cli(root).invoke(["docs", "cli"]);
  expect(cliRef.exitCode).toBe(0);
  expect(cliRef.stdout).toContain("CLI API reference");
  const skill = await new Cli(root).invoke(["docs", "skill"]);
  expect(skill.exitCode).toBe(0);
  expect(skill.stdout).toContain("name: myapp");
});

test("bare docs shows router help", () => {
  const root = cliPresentationRoot(docsFixture());
  const pr = parse(root, ["docs"]);
  expect(pr.kind).toBe(ParseKind.Help);
  const help = cliHelpRender(root, pr.helpPath, false);
  expect(help).toContain("cli");
  expect(help).not.toContain("Hello README");
});

test("docs readme prints bundled text", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "readme"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Hello README");
});
test("docs mcp when MCP enabled", async () => {
  const result = await new Cli(docsFixture(true)).invoke(["docs", "mcp"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("MCP server (myapp)");
  expect(result.stdout).toContain("myapp mcp");
  expect(result.stdout).toContain("claude_desktop_config.json");
  expect(result.stdout).toContain("configure --refresh --yes");
});

test("docs rejects unknown subcommand", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "all"]);
  expect(result.exitCode).not.toBe(0);
});

test("docs mcp absent from router when MCP disabled", async () => {
  const root = docsFixture(false);
  const presentation = cliPresentationRoot(root);
  const docsNode = presentation.commands.find((c) => c.key === "docs");
  expect(docsNode && "commands" in docsNode).toBe(true);
  if (docsNode && "commands" in docsNode) {
    expect(docsNode.commands.some((c) => c.key === "mcp")).toBe(false);
  }
  const result = await new Cli(root).invoke(["docs", "mcp"]);
  expect(result.exitCode).not.toBe(0);
});

test("docs http when API enabled", async () => {
  const root = docsFixture(true);
  root.httpServer = { enabled: true };
  cliValidateProgram(root);
  const result = await new Cli(root).invoke(["docs", "http"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("HTTP API (myapp)");
  expect(result.stdout).toContain("curl -s -X POST");
});

test("docs http absent from router when API disabled", async () => {
  const root = docsFixture(false);
  const presentation = cliPresentationRoot(root);
  const docsNode = presentation.commands.find((c) => c.key === "docs");
  expect(docsNode && "commands" in docsNode).toBe(true);
  if (docsNode && "commands" in docsNode) {
    expect(docsNode.commands.some((c) => c.key === "http")).toBe(false);
    expect(docsNode.commands.some((c) => c.key === "openapi")).toBe(false);
  }
  const result = await new Cli(root).invoke(["docs", "http"]);
  expect(result.exitCode).not.toBe(0);
});

test("docs openapi when API enabled", async () => {
  const root = docsFixture(true);
  root.httpServer = { enabled: true };
  cliValidateProgram(root);
  const result = await new Cli(root).invoke(["docs", "openapi"]);
  expect(result.exitCode).toBe(0);
  const doc = JSON.parse(result.stdout) as { openapi: string; paths: Record<string, unknown> };
  expect(doc.openapi).toBe("3.1.0");
  expect(doc.paths).toBeDefined();
});

test("docs openapi absent when API disabled", async () => {
  const root = docsFixture(false);
  const result = await new Cli(root).invoke(["docs", "openapi"]);
  expect(result.exitCode).not.toBe(0);
});

test("presentation includes docs subtree", () => {
  const presentation = cliPresentationRoot(docsFixture());
  const docsNode = presentation.commands.find((c) => c.key === "docs");
  expect(docsNode).toBeDefined();
  expect(docsNode && "commands" in docsNode && docsNode.commands.some((c) => c.key === "readme")).toBe(true);
});

test("docs cli-schema prints JSON", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "cli-schema"]);
  expect(result.exitCode).toBe(0);
  const schema = JSON.parse(result.stdout);
  expect(schema.key).toBe("myapp");
  expect(schema.commands.some((c: { key: string }) => c.key === "run")).toBe(true);
});

test("docs cli prints markdown reference", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "cli"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("# myapp — CLI API reference");
  expect(result.stdout).toContain("## `myapp run`");
  expect(result.stdout).toContain("Run something.");
  expect(result.stdout).toContain("myapp docs cli-schema");
});

test("skipsRequiredAppConfigExit includes docs and config builtins", () => {
  const program = {
    ...docsFixture(),
    appConfig: {
      entries: { token: { description: "Token.", env: "DOCS_SKIP_TOKEN" } },
    },
  };
  const caps = resolveCapabilities(program);
  expect(skipsRequiredAppConfigExit(["docs", "cli"], caps)).toBe(true);
  expect(skipsRequiredAppConfigExit(["configure", "get"], caps)).toBe(true);
  expect(skipsRequiredAppConfigExit(["run"], caps)).toBe(false);
});

test("docs skill prints Cursor SKILL.md", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "skill"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("---");
  expect(result.stdout).toContain("name: myapp");
  expect(result.stdout).toContain("## Commands");
  expect(result.stdout).toContain("For full detail, open `reference.md`");
  expect(result.stdout).not.toContain("#### Options");
  expect(result.stdout).not.toContain("mcp.json");
});

/** Docs skill help recommends configure. */
test("docs skill help recommends configure", async () => {
  const presentation = cliPresentationRoot(docsFixture());
  const docsNode = presentation.commands.find((c) => c.key === "docs");
  expect(docsNode && "commands" in docsNode).toBe(true);
  if (docsNode && "commands" in docsNode) {
    const skill = docsNode.commands.find((c) => c.key === "skill");
    expect(skill?.description).toContain("reference agent SKILL");
    expect(skill?.description).toContain("configure");
    expect(skill?.notes).toBeUndefined();
    expect(docsNode.notes).toContain("--save");
    expect(docsNode.notes).not.toContain("install --skill");
  }
});

test("presentation includes docs cli-schema and skill", () => {
  const presentation = cliPresentationRoot(docsFixture());
  const docsNode = presentation.commands.find((c) => c.key === "docs");
  expect(docsNode && "commands" in docsNode).toBe(true);
  if (docsNode && "commands" in docsNode) {
    expect(docsNode.commands.some((c) => c.key === "cli-schema")).toBe(true);
    expect(docsNode.commands.some((c) => c.key === "cli")).toBe(true);
    expect(docsNode.commands.some((c) => c.key === "skill")).toBe(true);
  }
});

test("completions offer docs subcommands", () => {
  const bash = completionBashScript(cliPresentationRoot(docsFixture()));
  expect(bash).toContain("docs) echo");
  expect(bash).toContain("readme) echo");
  expect(bash).toContain("cli-schema) echo");
  expect(bash).toContain("cli) echo");
  expect(bash).toContain("skill) echo");
});

test("generateMcpGuide includes schema URI and .agents install", () => {
  const guide = generateMcpGuide(docsFixture(true));
  expect(guide).toContain("myapp://schema");
  expect(guide).toContain("~/.agents/mcp.json");
  expect(guide).toContain("~/.cursor/mcp.json");
  expect(guide).toContain("claude_desktop_config.json");
  expect(guide).toContain("## Installation");
  expect(guide).toContain("## Running directly");
  expect(guide).toContain("configure --refresh");
  expect(guide).toContain("dotagentsprotocol.com");
  expect(guide).not.toContain("OpenAI Codex");
});

test("docs --save writes topic file", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "readme", "--save"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("docs/readme.md");
  const text = readFileSync(join(workDir, "docs/readme.md"), "utf8");
  expect(text).toContain("Hello README");
  expect(text).not.toContain("Generated by");
});

test("docs cli --save prepends generated hint", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "cli", "--save"]);
  expect(result.exitCode).toBe(0);
  const text = readFileSync(join(workDir, "docs/cli.md"), "utf8");
  expect(text.startsWith("<!-- Generated by myapp docs cli --save; do not edit. -->\n\n")).toBe(true);
  expect(text).toContain("CLI API reference");
});

test("docs skill --save keeps frontmatter first", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "skill", "--save"]);
  expect(result.exitCode).toBe(0);
  const text = readFileSync(join(workDir, "docs/skill.md"), "utf8");
  expect(text.startsWith("---\n")).toBe(true);
  expect(text).toContain("name: myapp");
  const hint = "<!-- Generated by myapp docs skill --save; do not edit. -->";
  expect(text.indexOf(hint)).toBeGreaterThan(text.indexOf("---\n", 4));
});

test("docs cli-schema --save writes JSON file", async () => {
  const result = await new Cli(docsFixture()).invoke(["docs", "cli-schema", "--save"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("docs/cli-schema.json");
  const text = readFileSync(join(workDir, "docs/cli-schema.json"), "utf8");
  expect(text).not.toContain("Generated by");
  const schema = JSON.parse(text);
  expect(schema.key).toBe("myapp");
});

test("docs openapi --save writes JSON file", async () => {
  const root = docsFixture(true);
  root.httpServer = { enabled: true };
  const result = await new Cli(root).invoke(["docs", "openapi", "--save"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("docs/openapi.json");
  const text = readFileSync(join(workDir, "docs/openapi.json"), "utf8");
  expect(text).not.toContain("Generated by");
  const doc = JSON.parse(text) as { openapi: string };
  expect(doc.openapi).toBe("3.1.0");
});

test("saveDocsTopic returns relative path", () => {
  const path = saveDocsTopic(docsFixture(), "cli");
  expect(path).toBe("docs/cli.md");
  const text = readFileSync(join(workDir, "docs/cli.md"), "utf8");
  expect(text).toContain("<!-- Generated by myapp docs cli --save; do not edit. -->");
  expect(text).toContain("CLI API reference");
});
