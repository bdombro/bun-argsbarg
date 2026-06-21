import type { CliContext } from "./context.ts";
import { isInteractiveTty } from "./utils.ts";

/** Minimal context for headless routing helpers. */
export type HeadlessContext = Pick<CliContext, "invocation">;

/** True when `--dry-run` was passed. */
export function wantsDryRun(hasDryRunFlag: boolean): boolean {
  return hasDryRunFlag;
}

/** True when `--json` was passed or the handler was invoked via MCP. */
export function wantsExplicitJson(ctx: HeadlessContext, hasJsonFlag: boolean): boolean {
  return hasJsonFlag || ctx.invocation === "mcp";
}

/**
 * Headless when MCP, `--json`, `--dry-run`, or stdin is not a TTY.
 * Use for commands that should auto-emit JSON in pipelines.
 */
export function shouldRunHeadless(
  ctx: HeadlessContext,
  hasJsonFlag: boolean,
  hasDryRunFlag = false,
  interactive: boolean = isInteractiveTty,
): boolean {
  if (ctx.invocation === "mcp") return true;
  if (hasJsonFlag || hasDryRunFlag) return true;
  return !interactive;
}

/**
 * Like {@link shouldRunHeadless}, but only auto-headless in non-TTY when positionals are present.
 * Avoids turning empty invocations into JSON errors.
 */
export function shouldRunHeadlessWithPositionals(
  ctx: HeadlessContext,
  hasJsonFlag: boolean,
  positionals: string[],
  hasDryRunFlag = false,
  interactive: boolean = isInteractiveTty,
): boolean {
  if (ctx.invocation === "mcp") return true;
  if (hasJsonFlag || hasDryRunFlag) return true;
  return !interactive && positionals.length > 0;
}

/**
 * Headless when MCP, `--dry-run` with required args, or non-TTY with `--yes` and required args.
 * Use for mutating commands that require explicit `--yes` in scripts.
 */
export function shouldRunHeadlessWithYes(
  ctx: HeadlessContext,
  opts: { yes: boolean; hasRequiredArgs: boolean; dryRun?: boolean },
  interactive: boolean = isInteractiveTty,
): boolean {
  if (ctx.invocation === "mcp") {
    return opts.hasRequiredArgs && (opts.yes || Boolean(opts.dryRun));
  }
  if (opts.dryRun && opts.hasRequiredArgs) return true;
  if (!interactive) return opts.yes && opts.hasRequiredArgs;
  return opts.yes && opts.hasRequiredArgs;
}

/**
 * Exits when non-interactive mode is used without `--yes`.
 * @param hint - Command-specific guidance appended to the error
 */
export function requireYesInNonTty(
  yes: boolean,
  hint: string,
  dryRun = false,
  interactive: boolean = isInteractiveTty,
): void {
  if (dryRun) return;
  if (!interactive && !yes) {
    process.stderr.write(`Error: non-interactive mode requires --yes. ${hint}\n`);
    process.exit(1);
  }
}

/** Prefixes a success message when running in dry-run mode. */
export function formatDryRunMessage(message: string, dryRun: boolean): string {
  if (!dryRun) return message;
  return `[DRY RUN] ${message}`;
}
