/** Interactive prompts for `argsbarg create`. */

import { readPromptLine as readStdinLine } from "../prompt.ts";

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
