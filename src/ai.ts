/*
This module re-exports AI agent integration entry points (skill install).
MCP stdio serving remains in mcp.ts.
*/

export { cliSkillInstall, type SkillInstallOpts } from "./skill/install.ts";
export { generateSkillBundle, type SkillBundle, type SkillTarget } from "./skill/generate.ts";
