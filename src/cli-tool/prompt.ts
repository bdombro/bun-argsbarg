/** Interactive prompts for `argsbarg create`. */

import { readSync } from "node:fs";

import { CREATE_TEMPLATES, type CreateTemplateId } from "./create.ts";

/** Reads one line from stdin (no masking). */
function readStdinLine(): string {
  const buf = Buffer.alloc(4096);
  const n = readSync(0, buf, { length: 4096 });
  return buf.toString("utf8", 0, n).replace(/\r?\n$/, "");
}

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

/** Lettered picker for the create template (A, B, C … in `CREATE_TEMPLATES` order; the key also works). */
export function promptTemplateChoice(): CreateTemplateId {
  process.stderr.write("\nSelect a template:\n\n");
  CREATE_TEMPLATES.forEach((template, i) => {
    process.stderr.write(`${String.fromCharCode(65 + i)}) ${template.id} — ${template.description}\n`);
  });
  process.stderr.write("\n");
  while (true) {
    const ans = readPromptLine("Choice: ").trim().toLowerCase();
    const byLetter = CREATE_TEMPLATES[ans.charCodeAt(0) - 97];
    if (ans.length === 1 && byLetter) return byLetter.id;
    const byId = CREATE_TEMPLATES.find((t) => t.id === ans);
    if (byId) return byId.id;
    process.stderr.write(`  Enter ${CREATE_TEMPLATES.map((_, i) => String.fromCharCode(65 + i)).join(", ")}.\n`);
  }
}
