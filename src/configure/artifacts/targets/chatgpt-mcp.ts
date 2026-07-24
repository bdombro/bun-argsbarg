import { chatGptDesktopPresent, userHome } from "~/configure/artifacts/paths.ts";
import { McpJsonInstallTarget } from "~/configure/artifacts/target-mcp-json.ts";

export const chatgptMcpTarget = new McpJsonInstallTarget({
  key: "chatgptMcp",
  actionKind: "chatgpt-desktop-mcp",
  label: "chatgpt desktop mcp",
  configPath: (p) => p.chatGptMcpPath,
  detectedKey: "chatGptMcp",
  statusField: "chatGptMcp",
  isAvailable: (_root, paths) => chatGptDesktopPresent(userHome(), paths.chatGptMcpPath),
});
