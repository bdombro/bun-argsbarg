import { expect, test } from "bun:test";
import { cliPresentationRoot } from "../builtins/presentation.ts";
import { completionBashScript } from "../completion.ts";
import { cliInvoke } from "../index.ts";
import type { CliProgram } from "../types.ts";
import { cliValidateProgram } from "../validate.ts";
import { combineAllDocs, docsEffectiveDefaultTopic } from "./resolve.ts";
import { generateMcpGuide } from "./mcp-guide.ts";

function docsFixture(mcp = true): CliProgram {
  return {
    key: "myapp",
    version: "1.0.0",
    description: "Demo app.",
    mcpServer: mcp ? { enabled: true } : undefined,
    docs: {
      enabled: true,
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

test("docs rejects reserved topic keys", () => {
  const root = docsFixture();
  root.docs!.topics.schema = { text: "nope" };
  expect(() => cliValidateProgram(root)).toThrow(/reserved/);
  delete root.docs!.topics.schema;
  root.docs!.topics.skill = { text: "nope" };
  expect(() => cliValidateProgram(root)).toThrow(/reserved/);
  delete root.docs!.topics.skill;
  root.docs!.topics.api = { text: "nope" };
  expect(() => cliValidateProgram(root)).toThrow(/reserved/);
});

test("docsEffectiveDefaultTopic uses first topic key", () => {
  expect(docsEffectiveDefaultTopic(docsFixture().docs!)).toBe("readme");
});

test("bare docs prints first topic via cliInvoke", async () => {
  const result = await cliInvoke(docsFixture(), ["docs"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Hello README");
});

test("docs readme prints bundled text", async () => {
  const result = await cliInvoke(docsFixture(), ["docs", "readme"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Hello README");
});

test("docs defaultTopic override", async () => {
  const root = docsFixture();
  root.docs!.defaultTopic = "arch";
  const result = await cliInvoke(root, ["docs"]);
  expect(result.stdout).toContain("Architecture");
});

test("docs mcp when MCP enabled", async () => {
  const result = await cliInvoke(docsFixture(true), ["docs", "mcp"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("MCP server (myapp)");
  expect(result.stdout).toContain("myapp mcp");
});

test("docs mcp absent from router when MCP disabled", async () => {
  const root = docsFixture(false);
  const presentation = cliPresentationRoot(root);
  const docsNode = presentation.commands.find((c) => c.key === "docs");
  expect(docsNode && "commands" in docsNode).toBe(true);
  if (docsNode && "commands" in docsNode) {
    expect(docsNode.commands.some((c) => c.key === "mcp")).toBe(false);
  }
  const result = await cliInvoke(root, ["docs", "mcp"]);
  expect(result.exitCode).not.toBe(0);
});

test("docs all concatenates user topics and mcp", () => {
  const program = docsFixture(true);
  const combined = combineAllDocs(program);
  expect(combined).toContain("Hello README");
  expect(combined).toContain("Architecture");
  expect(combined).toContain("MCP server (myapp)");
});

test("presentation includes docs subtree", () => {
  const presentation = cliPresentationRoot(docsFixture());
  const docsNode = presentation.commands.find((c) => c.key === "docs");
  expect(docsNode).toBeDefined();
  expect(docsNode && "commands" in docsNode && docsNode.commands.some((c) => c.key === "readme")).toBe(
    true,
  );
});

test("docs schema prints JSON", async () => {
  const result = await cliInvoke(docsFixture(), ["docs", "schema"]);
  expect(result.exitCode).toBe(0);
  const schema = JSON.parse(result.stdout);
  expect(schema.key).toBe("myapp");
  expect(schema.commands.some((c: { key: string }) => c.key === "run")).toBe(true);
});

test("docs api prints markdown reference", async () => {
  const result = await cliInvoke(docsFixture(), ["docs", "api"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("# myapp — CLI API reference");
  expect(result.stdout).toContain("## `myapp run`");
  expect(result.stdout).toContain("Run something.");
  expect(result.stdout).toContain("myapp docs schema");
});

test("docs skill prints Cursor SKILL.md", async () => {
  const result = await cliInvoke(docsFixture(), ["docs", "skill"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("---");
  expect(result.stdout).toContain("name: myapp");
  expect(result.stdout).toContain("## Commands");
  expect(result.stdout).not.toContain("mcp.json");
});

test("presentation includes docs schema and skill", () => {
  const presentation = cliPresentationRoot(docsFixture());
  const docsNode = presentation.commands.find((c) => c.key === "docs");
  expect(docsNode && "commands" in docsNode).toBe(true);
  if (docsNode && "commands" in docsNode) {
    expect(docsNode.commands.some((c) => c.key === "schema")).toBe(true);
    expect(docsNode.commands.some((c) => c.key === "api")).toBe(true);
    expect(docsNode.commands.some((c) => c.key === "skill")).toBe(true);
  }
});

test("completions offer docs subcommands", () => {
  const bash = completionBashScript(cliPresentationRoot(docsFixture()));
  expect(bash).toContain("docs) echo");
  expect(bash).toContain("readme) echo");
  expect(bash).toContain("schema) echo");
  expect(bash).toContain("api) echo");
  expect(bash).toContain("skill) echo");
});

test("generateMcpGuide includes schema URI", () => {
  const guide = generateMcpGuide(docsFixture(true));
  expect(guide).toContain("myapp://schema");
});
