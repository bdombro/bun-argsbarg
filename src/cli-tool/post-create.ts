/** Post-create steps and git bootstrap for `argsbarg create`. */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type CreateTemplateId, DEFAULT_CREATE_TEMPLATE } from "./create.ts";

export function isInsideGitWorkTree(dir: string): boolean {
  try {
    const proc = Bun.spawnSync(["git", "-C", dir, "rev-parse", "--show-toplevel"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
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

export async function runPostCreate(
  targetDir: string,
  dryRun: boolean,
  /** Template that was copied; the plugin template also builds its committed Node bundle. */
  templateId: CreateTemplateId = DEFAULT_CREATE_TEMPLATE,
): Promise<void> {
  const abs = resolve(targetDir);
  const steps: Array<{ label: string; run: () => Promise<void> | void }> = [
    {
      label: "bun install",
      run: () => {
        if (dryRun) return;
        const proc = Bun.spawnSync(["bun", "install"], {
          cwd: abs,
          stdout: "inherit",
          stderr: "inherit",
        });
        if (proc.exitCode !== 0) throw new Error("bun install failed");
      },
    },
    ...(templateId === "agent-plugin"
      ? [
          {
            label: "just build (plugin bundle in dist/)",
            run: () => {
              if (dryRun) return;
              let proc: ReturnType<typeof Bun.spawnSync>;
              try {
                proc = Bun.spawnSync(["just", "build"], { cwd: abs, stdout: "inherit", stderr: "inherit" });
              } catch {
                process.stderr.write(
                  "`just` not found; run `just build` before installing the plugin (it runs dist/).\n",
                );
                return;
              }
              if (proc.exitCode !== 0) throw new Error("just build failed");
            },
          },
        ]
      : []),
    {
      label: "bun test",
      run: () => {
        if (dryRun) return;
        const proc = Bun.spawnSync(["bun", "test"], {
          cwd: abs,
          stdout: "inherit",
          stderr: "inherit",
        });
        if (proc.exitCode !== 0) throw new Error("bun test failed");
      },
    },
    {
      label: "git init + Initial commit",
      run: () => {
        if (dryRun) return;
        if (shouldSkipGitBootstrap(abs)) {
          process.stderr.write("Skipping git bootstrap (existing repo or nested in git work tree).\n");
          return;
        }
        let proc = Bun.spawnSync(["git", "init"], {
          cwd: abs,
          stdout: "inherit",
          stderr: "inherit",
        });
        if (proc.exitCode !== 0) throw new Error("git init failed");
        proc = Bun.spawnSync(["git", "add", "-A"], {
          cwd: abs,
          stdout: "inherit",
          stderr: "inherit",
        });
        if (proc.exitCode !== 0) throw new Error("git add failed");
        proc = Bun.spawnSync(["git", "commit", "-m", "Initial commit"], {
          cwd: abs,
          stdout: "inherit",
          stderr: "inherit",
        });
        if (proc.exitCode !== 0) throw new Error("git commit failed");
      },
    },
  ];

  for (const step of steps) {
    process.stderr.write(`→ ${step.label}\n`);
    await step.run();
  }
}

export function printPostCreatePlan(templateId: CreateTemplateId = DEFAULT_CREATE_TEMPLATE): void {
  const steps = [
    "bun install",
    ...(templateId === "agent-plugin" ? ["just build (plugin bundle in dist/)"] : []),
    "bun test",
    "git init + Initial commit (skipped inside existing git work tree)",
  ];
  process.stderr.write("Post-create steps:\n");
  steps.forEach((step, i) => {
    process.stderr.write(`  ${i + 1}. ${step}\n`);
  });
}
