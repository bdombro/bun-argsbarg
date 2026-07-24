import { chatGptDesktopPresent, userHome } from "../paths.ts";
import { McpJsonInstallTarget } from "../target-mcp-json.ts";

export const chatgptMcpTarget = new McpJsonInstallTarget({
  key: "chatgptMcp",
  actionKind: "chatgpt-desktop-mcp",
  label: "chatgpt desktop mcp",
  configPath: (p) => p.chatGptMcpPath,
  detectedKey: "chatGptMcp",
  statusField: "chatGptMcp",
  isAvailable: (_root, paths) => chatGptDesktopPresent(userHome(), paths.chatGptMcpPath),
});
