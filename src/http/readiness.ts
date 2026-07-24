/*
HTTP/MCP readiness checks for GET /health/ready (orchestrator probes only).
*/

import type { AnyAppConfigSnapshot } from "~/config/context.ts";
import { missingRequiredConfig } from "~/config/resolve.ts";
import type { CliProgram, ReadinessContext, ServerRuntime } from "~/core/types.ts";

const READINESS_CACHE_MS = 3000;

export interface ReadinessCheck {
  ok: boolean;
  error?: string;
  missing?: string[];
}

export interface ReadinessResult {
  ok: boolean;
  checks: Record<string, ReadinessCheck>;
}

function configFileCheck(runtime: ServerRuntime): ReadinessCheck {
  const err = runtime.state.configFileError;
  if (typeof err === "string" && err.length > 0) {
    return { ok: false, error: err };
  }
  return { ok: true };
}

function configRequiredCheck(program: CliProgram, appConfig: AnyAppConfigSnapshot): ReadinessCheck {
  if (!program.appConfig) {
    return { ok: true };
  }
  const missing = missingRequiredConfig(program, appConfig.read());
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}

async function customReadinessCheck(ctx: ReadinessContext): Promise<ReadinessCheck> {
  const fn = ctx.program.readiness;
  if (!fn) {
    return { ok: true };
  }
  try {
    const ok = await Promise.resolve(fn(ctx));
    return ok ? { ok: true } : { ok: false, error: "readiness check returned false" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/** Runs built-in + custom readiness checks (short TTL cache in runtime.state). */
export async function evaluateReadiness(
  program: CliProgram,
  surface: "http" | "mcp",
  runtime: ServerRuntime,
  appConfig: AnyAppConfigSnapshot,
): Promise<ReadinessResult> {
  const cached = runtime.state.readinessCache;
  if (cached && Date.now() - cached.at < READINESS_CACHE_MS) {
    return cached.result;
  }

  const ctx: ReadinessContext = { program, surface, appConfig, runtime };
  const checks: Record<string, ReadinessCheck> = {
    config_file: configFileCheck(runtime),
    config_required: configRequiredCheck(program, appConfig),
    custom: await customReadinessCheck(ctx),
  };
  const ok = Object.values(checks).every((c) => c.ok);
  const result: ReadinessResult = { ok, checks };
  runtime.state.readinessCache = { at: Date.now(), result };
  runtime.state.readiness = result;
  return result;
}
