/** `argsbarg create` command orchestration. */

import { mkdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  applyCreate,
  type CreateOptions,
  classNameFromKey,
  diffCreateDetails,
  parseCreateArgv,
  printCreateDiffs,
  renderCreateTree,
  resolveCreateOptions,
} from "./create.ts";
import { printPostCreatePlan, runPostCreate } from "./post-create.ts";
import { promptConfirm, promptOptional, promptRequired } from "./prompt.ts";

function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY);
}

function collectInteractiveOptions(
  partial: Partial<CreateOptions>,
  dir: string,
): { opts: CreateOptions; baseDir: string } {
  process.stderr.write("Argsbarg create — bootstrap a new CLI from full-example\n\n");
  const targetDir = promptOptional("Target directory", dir) ?? dir;
  const baseDir = resolve(process.cwd(), targetDir);
  const key = promptRequired("CLI key (binary name)", partial.key);
  const className =
    promptOptional("Formula class name", partial.className ?? classNameFromKey(key)) ??
    classNameFromKey(key);
  const releaseRepo =
    promptOptional("GitHub release repo (org/repo)", partial.releaseRepo ?? `example/${key}`) ??
    `example/${key}`;
  const homepage =
    promptOptional("Homepage URL", partial.homepage ?? `https://github.com/${releaseRepo}`) ??
    `https://github.com/${releaseRepo}`;
  const tap =
    promptOptional("Homebrew tap (org/repo)", partial.tap ?? `local/${key}`) ?? `local/${key}`;
  const desc =
    promptOptional("Formula description", partial.desc ?? `${className} CLI`) ?? `${className} CLI`;

  const opts = resolveCreateOptions(
    {
      ...partial,
      key,
      className,
      tap,
      homepage,
      releaseRepo,
      desc,
      force: partial.force ?? false,
    },
    baseDir,
  );

  process.stderr.write(`\nTarget: ${baseDir}\n`);
  process.stderr.write(`Key: ${opts.key}  Class: ${opts.className}  Tap: ${opts.tap}\n\n`);
  const tree = renderCreateTree(opts);
  process.stderr.write(`Files (${tree.size}):\n`);
  for (const rel of [...tree.keys()].sort()) {
    process.stderr.write(`  ${rel}\n`);
  }
  process.stderr.write("\n");
  printPostCreatePlan();
  process.stderr.write("\n");

  if (!promptConfirm("Proceed")) {
    throw new Error("Aborted.");
  }

  return { opts, baseDir };
}

export async function runCreate(input: Partial<CreateOptions> & { dir?: string }): Promise<number> {
  try {
    const baseDir = resolve(process.cwd(), input.dir ?? ".");
    const partial = { ...input };
    delete (partial as { dir?: string }).dir;

    if (partial.check || partial.diff) {
      const drifts = diffCreateDetails(baseDir, partial);
      if (drifts.length > 0) {
        process.stderr.write(`Create drift in ${baseDir}:\n`);
        for (const d of drifts) process.stderr.write(`  ${d.rel}\n`);
        if (partial.diff) printCreateDiffs(drifts, baseDir);
        return 1;
      }
      process.stdout.write(`Create OK: ${baseDir}\n`);
      return 0;
    }

    let opts: CreateOptions;
    if (!partial.yes && isInteractiveTty()) {
      const collected = collectInteractiveOptions(partial, input.dir ?? ".");
      opts = collected.opts;
      return runCreateApply(collected.baseDir, opts, partial.dryRun ?? false);
    }

    if (!partial.yes && !isInteractiveTty()) {
      throw new Error("Refusing to proceed without --yes (stdin is not a TTY).");
    }
    if (!partial.key) {
      throw new Error("--key is required in non-interactive mode.");
    }
    opts = resolveCreateOptions(partial, baseDir);
    return runCreateApply(baseDir, opts, partial.dryRun ?? false);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

async function runCreateApply(
  baseDir: string,
  opts: CreateOptions,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    const written = applyCreate(baseDir, { ...opts, dryRun: true, check: false });
    process.stdout.write(`Would write ${written.length} file(s) under ${baseDir}\n`);
    for (const w of written) process.stdout.write(`  ${relative(baseDir, w) || w}\n`);
    printPostCreatePlan();
    return 0;
  }

  mkdirSync(baseDir, { recursive: true });
  const written = applyCreate(baseDir, {
    ...opts,
    dryRun: false,
    check: false,
    force: opts.force,
  });
  process.stdout.write(`Created ${written.length} file(s) under ${baseDir}\n`);
  for (const w of written) {
    process.stdout.write(`  ${relative(baseDir, w) || w}\n`);
  }

  await runPostCreate(baseDir, false);
  process.stdout.write("Done.\n");
  return 0;
}

/** Parse argv and run create (for tests and direct script invocation). */
export async function runCreateCommand(rest: string[]): Promise<number> {
  const { dir, opts } = parseCreateArgv(rest);
  return runCreate({ ...opts, dir });
}
