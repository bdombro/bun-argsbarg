/** CLI identity — substituted by `argsbarg create`. */

export const createIdentity = {
  key: "mcp-plugin",
  className: "McpPlugin",
  tap: "bdombro/bun-argsbarg",
  homepage: "https://github.com/bdombro/bun-argsbarg",
  releaseRepo: "bdombro/bun-argsbarg",
  desc: "Argsbarg MCP plugin template for Cursor and Claude Code marketplaces",
  envPrefix: "MCP_PLUGIN",
  template: "plugin",
} as const;
