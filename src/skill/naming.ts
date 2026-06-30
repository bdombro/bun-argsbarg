/** Agent skill install targets. */
export type SkillTarget = "cursor" | "claude" | "codex" | "opencode" | "openclaw";

import { sanitizeToolSegment } from "../mcp/tools.ts";

/** Kebab-case skill folder + frontmatter name for agents that require hyphen slugs. */
export function skillSlug(programKey: string): string {
  return programKey
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** Directory name for a skill target (underscore vs kebab conventions). */
export function skillDirNameForTarget(programKey: string, target: SkillTarget): string {
  if (target === "cursor" || target === "claude") {
    return sanitizeToolSegment(programKey);
  }
  return skillSlug(programKey);
}

/** Frontmatter `name` for SKILL.md by target. */
export function skillFrontmatterName(programKey: string, target: SkillTarget): string {
  if (target === "cursor" || target === "claude") {
    return sanitizeToolSegment(programKey);
  }
  return skillSlug(programKey);
}
