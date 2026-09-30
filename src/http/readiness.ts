/*
HTTP/MCP readiness checks for GET /health/readiness (orchestrator probes only).
*/

import type { AppSpec, ReadinessContext, ServerRuntime } from "../core/types.ts";

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

async function customReadinessCheck(ctx: ReadinessContext): Promise<ReadinessCheck> {
  const fn = ctx.spec.readiness;
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

/** Runs the app's readiness check (short TTL cache in runtime.state). */
export async function evaluateReadiness(
  program: AppSpec,
  surface: "http" | "mcp",
  runtime: ServerRuntime,
): Promise<ReadinessResult> {
  const cached = runtime.state.readinessCache;
  if (cached && Date.now() - cached.at < READINESS_CACHE_MS) {
    return cached.result;
  }

  const ctx: ReadinessContext = { spec: program, surface, runtime };
  const checks: Record<string, ReadinessCheck> = {
    custom: await customReadinessCheck(ctx),
  };
  const ok = Object.values(checks).every((c) => c.ok);
  const result: ReadinessResult = { ok, checks };
  runtime.state.readinessCache = { at: Date.now(), result };
  runtime.state.readiness = result;
  return result;
}
