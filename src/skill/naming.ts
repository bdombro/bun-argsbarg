/** Skill directory and frontmatter name from program key (path-safe segment). */
export function skillDirName(programKey: string): string {
  return programKey.replace(/[/\\\s]/g, "_");
}
