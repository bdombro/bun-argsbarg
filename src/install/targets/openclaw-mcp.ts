import { openclawOnPath } from "../mcp-openclaw.ts";
import {
  checkOpenclawMcpConflict,
  McpCliInstallTarget,
  mergeOpenclawMcpConfig,
  openclawMcpHasServer,
  removeOpenclawMcpConfig,
} from "../target-mcp-cli.ts";

export const openclawMcpTarget = new McpCliInstallTarget({
  key: "openclawMcp",
  actionKind: "openclaw-mcp",
  label: "openclaw mcp",
  pairedSkillKey: "openclawSkill",
  configPath: (p) => p.openclawConfigPath,
  detectedKey: "openclawMcp",
  statusField: "openclawMcp",
  isAvailable: () => openclawOnPath(),
  hasServer: openclawMcpHasServer,
  installMessage: 'Registering MCP server "{name}" via openclaw mcp add',
  uninstallMessage: 'Removing MCP server "{name}" from OpenClaw via openclaw mcp unset',
  merge: mergeOpenclawMcpConfig,
  remove: removeOpenclawMcpConfig,
  preflight: checkOpenclawMcpConflict,
});
