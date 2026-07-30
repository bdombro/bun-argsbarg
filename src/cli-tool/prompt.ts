/** Interactive prompts for `argsbarg create`. */

import { readPromptLine as readStdinLine } from "../prompt.ts";
import { CREATE_TEMPLATES, type CreateTemplateId, normalizeCreateTemplateId } from "./create.ts";

export function readPromptLine(prompt: string): string {
  process.stderr.write(prompt);
  return readStdinLine().trim();
}

export function promptConfirm(message: string): boolean {
  const ans = readPromptLine(`${message} [y/N]: `);
  return ans === "y" || ans === "Y";
}

export function promptOptional(label: string, current?: string): string | undefined {
  const suffix = current ? ` [${current}]` : "";
  const ans = readPromptLine(`${label}${suffix}: `);
  if (ans.length === 0) return current;
  return ans;
}

export function promptRequired(label: string, current?: string): string {
  while (true) {
    const value = promptOptional(label, current);
    if (value && value.length > 0) return value;
    process.stderr.write("  (required)\n");
  }
}

/** A/B picker for create template (returns cli or json). */
export function promptTemplateChoice(): CreateTemplateId {
  const cli = CREATE_TEMPLATES.find((t) => t.id === "cli");
  const json = CREATE_TEMPLATES.find((t) => t.id === "json");
  if (!cli || !json) {
    throw new Error("CREATE_TEMPLATES must include cli and json entries");
  }
  process.stderr.write("\nSelect a template:\n\n");
  process.stderr.write(`A) ${cli.displayName} — ${cli.description}\n`);
  process.stderr.write(`B) ${json.displayName} — ${json.description}\n\n`);
  while (true) {
    const ans = readPromptLine("Choice: ").toLowerCase();
    if (ans === "a") return "cli";
    if (ans === "b") return "json";
    process.stderr.write("  Enter A or B.\n");
  }
}

export function parseTemplateChoiceInput(value: string | undefined): CreateTemplateId | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "a" || normalized === "cli") return "cli";
  if (normalized === "b" || normalized === "json") return "json";
  return normalizeCreateTemplateId(value);
}
