/** Post-create steps and git bootstrap for `argsbarg create`. */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { CREATE_TEMPLATES, type CreateTemplateId, DEFAULT_CREATE_TEMPLATE } from "./create.ts";

/** Runs a command in `cwd` with inherited stdio; returns its exit code (null when it could not start). */
function run(
  /** Executable and arguments. */
  cmd: string[],
  /** Working directory. */
  cwd: string,
): number | null {
  const [bin, ...args] = cmd;
  const proc = spawnSync(bin ?? "", args, { cwd, stdio: "inherit" });
  return proc.error ? null : proc.status;
}

/** True when `dir` is inside a git work tree. */
export function isInsideGitWorkTree(dir: string): boolean {
  const proc = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { stdio: "pipe" });
  return !proc.error && proc.status === 0;
}

export function shouldSkipGitBootstrap(targetDir: string): boolean {
  if (existsSync(join(targetDir, ".git"))) return true;
  const parent = resolve(targetDir, "..");
  if (parent === targetDir) return false;
  if (isInsideGitWorkTree(parent) && !isInsideGitWorkTree(targetDir)) {
    return true;
  }
  return false;
}

/** One post-create step: its label and the command it runs in the new project. */
interface PostCreateStep {
  /** Label shown in the plan and progress output. */
  label: string;
  /** Command and arguments (git steps are handled separately). */
  cmd: string[];
}

/** Install / build / test steps for a template, using its package manager. */
function postCreateSteps(
  /** Template that was copied. */
  templateId: CreateTemplateId,
): PostCreateStep[] {
  const pm = CREATE_TEMPLATES.find((t) => t.id === templateId)?.packageManager ?? "npm";
  const steps: PostCreateStep[] = [{ label: `${pm} install`, cmd: [pm, "install"] }];
  if (templateId === "agent-plugin") {
    steps.push({ label: "just build (plugin bundle in dist/)", cmd: ["just", "build"] });
  }
  steps.push({ label: "just test", cmd: ["just", "test"] });
  return steps;
}

/** Runs install/build/test and the initial git commit in a freshly created project. */
export async function runPostCreate(
  /** New project directory. */
  targetDir: string,
  /** When true, print nothing and run nothing. */
  dryRun: boolean,
  /** Template that was copied (decides npm vs bun and the plugin bundle step). */
  templateId: CreateTemplateId = DEFAULT_CREATE_TEMPLATE,
): Promise<void> {
  if (dryRun) return;
  const abs = resolve(targetDir);
  for (const step of postCreateSteps(templateId)) {
    process.stderr.write(`→ ${step.label}\n`);
    const code = run(step.cmd, abs);
    if (code === null) {
      process.stderr.write(`\`${step.cmd[0]}\` not found; run \`${step.cmd.join(" ")}\` yourself.\n`);
      continue;
    }
    if (code !== 0) throw new Error(`${step.cmd.join(" ")} failed`);
  }
  process.stderr.write("→ git init + Initial commit\n");
  if (shouldSkipGitBootstrap(abs)) {
    process.stderr.write("Skipping git bootstrap (existing repo or nested in git work tree).\n");
    return;
  }
  if (run(["git", "init"], abs) !== 0) throw new Error("git init failed");
  if (run(["git", "add", "-A"], abs) !== 0) throw new Error("git add failed");
  if (run(["git", "commit", "-m", "Initial commit"], abs) !== 0) throw new Error("git commit failed");
}

/** Prints the post-create steps for a template. */
export function printPostCreatePlan(
  /** Template that will be copied. */
  templateId: CreateTemplateId = DEFAULT_CREATE_TEMPLATE,
): void {
  const steps = [
    ...postCreateSteps(templateId).map((step) => step.label),
    "git init + Initial commit (skipped inside existing git work tree)",
  ];
  process.stderr.write("Post-create steps:\n");
  steps.forEach((step, i) => {
    process.stderr.write(`  ${i + 1}. ${step}\n`);
  });
}
