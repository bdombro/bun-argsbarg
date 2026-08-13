import { McpJsonInstallTarget } from "../target-mcp-json.ts";

export const agentsMcpTarget = new McpJsonInstallTarget({
  key: "agentsMcp",
  actionKind: "agents-mcp",
  label: "agents mcp",
  configPath: (p) => p.agentsMcpPath,
  detectedKey: "agentsMcp",
  statusField: "agentsMcp",
  isAvailable: (root) => root.mcpServer?.enabled === true,
});
