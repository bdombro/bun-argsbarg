/*
MCP bundle export (`argsbarg/mcp`). @experimental
*/

export type { McpBundlePaths, PackMcpBundleOpts } from "../mcp/bundle.ts";
export { defaultMcpBundlePaths, generateMcpManifest, packMcpBundle } from "../mcp/bundle.ts";
export {
  defaultClaudePluginPaths,
  generatePluginManifest,
  generatePluginMcpJson,
  packClaudePlugin,
} from "../mcp/claude.ts";
export {
  defaultCursorPluginPaths,
  generateCursorPluginManifest,
  generateCursorPluginMcpJson,
  packCursorPlugin,
} from "../mcp/cursor.ts";
