/** Post-create steps and git bootstrap for `argsbarg create`. */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

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

export async function runPostCreate(targetDir: string, dryRun: boolean): Promise<void> {
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
    {
      label: "bun scripts/schemagen.ts",
      run: () => {
        if (dryRun) return;
        const proc = Bun.spawnSync(["bun", "scripts/schemagen.ts"], {
          cwd: abs,
          stdout: "inherit",
          stderr: "inherit",
        });
        if (proc.exitCode !== 0) throw new Error("schemagen failed");
      },
    },
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

export function printPostCreatePlan(): void {
  process.stderr.write("Post-create steps:\n");
  process.stderr.write("  1. bun install\n");
  process.stderr.write("  2. bun scripts/schemagen.ts\n");
  process.stderr.write("  3. bun test\n");
  process.stderr.write("  4. git init + Initial commit (skipped inside existing git work tree)\n");
}
