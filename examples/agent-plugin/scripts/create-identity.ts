/** CLI identity — substituted by `argsbarg create`. */

export const createIdentity = {
  key: "example-agent-plugin",
  className: "ExampleAgentPlugin",
  tap: "bdombro/bun-argsbarg",
  homepage: "https://github.com/bdombro/bun-argsbarg",
  releaseRepo: "bdombro/bun-argsbarg",
  desc: "Argsbarg MCP plugin template for Cursor and Claude Code marketplaces",
  envPrefix: "EXAMPLE_AGENT_PLUGIN",
  template: "agent-plugin",
} as const;
