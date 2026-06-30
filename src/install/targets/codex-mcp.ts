import { codexOnPath } from "../mcp-codex.ts";
import {
  checkCodexMcpConflict,
  codexMcpHasServer,
  McpCliInstallTarget,
  mergeCodexMcpConfig,
  removeCodexMcpConfig,
} from "../target-mcp-cli.ts";

export const codexMcpTarget = new McpCliInstallTarget({
  key: "codexMcp",
  actionKind: "codex-mcp",
  label: "codex mcp",
  pairedSkillKey: "codexSkill",
  configPath: (p) => p.codexConfigPath,
  detectedKey: "codexMcp",
  statusField: "codexMcp",
  isAvailable: () => codexOnPath(),
  hasServer: codexMcpHasServer,
  installMessage: 'Registering MCP server "{name}" via codex mcp add',
  uninstallMessage: 'Removing MCP server "{name}" from Codex via codex mcp remove',
  merge: mergeCodexMcpConfig,
  remove: removeCodexMcpConfig,
  preflight: checkCodexMcpConflict,
});
