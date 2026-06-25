import { expect, test } from "bun:test";
import type { CliProgram } from "../types.ts";
import {
  defaultDocsTopicResourceUri,
  docsMcpResources,
  reservedDocsTopicResourceUris,
  resolveDocsTopicResourceUri,
} from "./mcp-resources.ts";

function fixture(opts?: { docs?: boolean; mcp?: boolean }): CliProgram {
  const docs = opts?.docs !== false;
  const mcp = opts?.mcp !== false;
  return {
    key: "my-app",
    version: "1.0.0",
    description: "Test.",
    ...(docs
      ? {
          docs: {
            enabled: true,
            topics: {
              readme: { text: "# Readme\n", description: "User guide." },
              arch: { text: "# Arch\n" },
            },
          },
        }
      : {}),
    ...(mcp ? { mcpServer: { enabled: true } } : {}),
    handler: () => {},
  };
}

test("defaultDocsTopicResourceUri", () => {
  expect(defaultDocsTopicResourceUri("my_app", "readme")).toBe("my_app://docs/readme");
});

test("resolveDocsTopicResourceUri sanitizes program key", () => {
  expect(resolveDocsTopicResourceUri(fixture(), "readme")).toBe("my_app://docs/readme");
});

test("docsMcpResources when docs and MCP enabled", () => {
  const resources = docsMcpResources(fixture());
  expect(resources.map((r) => r.uri)).toEqual(["my_app://docs/readme", "my_app://docs/arch"]);
  expect(resources[0]?.name).toBe("readme");
  expect(resources[0]?.mimeType).toBe("text/markdown");
  expect(resources[0]?.description).toBe("User guide.");
  expect(resources[0]?.load()).toBe("# Readme\n");
});

test("docsMcpResources empty when docs disabled", () => {
  expect(docsMcpResources(fixture({ docs: false }))).toEqual([]);
});

test("docsMcpResources empty when MCP disabled", () => {
  expect(docsMcpResources(fixture({ mcp: false }))).toEqual([]);
});

test("reservedDocsTopicResourceUris matches docsMcpResources URIs", () => {
  const program = fixture();
  expect(reservedDocsTopicResourceUris(program)).toEqual(
    docsMcpResources(program).map((r) => r.uri),
  );
});
