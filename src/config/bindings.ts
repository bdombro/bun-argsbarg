/*
Per-key config binding metadata (`_bindings`) — records how each schema key is satisfied.
*/

import type { CliAppConfigEntry } from "~/core/types.ts";

/** Reserved top-level config file key for per-entry binding metadata. */
export const CONFIG_BINDINGS_KEY = "_bindings";

export type ConfigBinding = "env" | "file" | "skip";

const BINDING_VALUES = new Set<string>(["env", "file", "skip"]);

/** True for argsbarg-reserved top-level keys (e.g. `_bindings`). */
export function isFrameworkConfigKey(key: string): boolean {
  return key.startsWith("_");
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.length === 0) return false;
  return true;
}

/** Read `_bindings` from raw file data; returns `{}` when absent or invalid. */
export function readBindings(fileData: Record<string, unknown>): Record<string, ConfigBinding> {
  const raw = fileData[CONFIG_BINDINGS_KEY];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, ConfigBinding> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === "string" && BINDING_VALUES.has(val)) {
      out[key] = val as ConfigBinding;
    }
  }
  return out;
}

/** Validate `_bindings` shape when present. */
export function validateBindingsShape(fileData: Record<string, unknown>, pathPrefix = "$"): string[] {
  const raw = fileData[CONFIG_BINDINGS_KEY];
  if (raw === undefined) return [];
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${pathPrefix}.${CONFIG_BINDINGS_KEY}: must be object`);
    return errors;
  }
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val !== "string" || !BINDING_VALUES.has(val)) {
      errors.push(`${pathPrefix}.${CONFIG_BINDINGS_KEY}.${key}: must be "env", "file", or "skip"`);
    }
  }
  return errors;
}

/** Return a new file object with an updated binding for `key`. */
export function setBinding(
  fileData: Record<string, unknown>,
  key: string,
  binding: ConfigBinding,
): Record<string, unknown> {
  const bindings = { ...readBindings(fileData), [key]: binding };
  return { ...fileData, [CONFIG_BINDINGS_KEY]: bindings };
}

/** Return a new file object without a binding for `key`. */
export function clearBinding(fileData: Record<string, unknown>, key: string): Record<string, unknown> {
  const bindings = readBindings(fileData);
  if (!(key in bindings)) {
    return fileData;
  }
  const nextBindings = { ...bindings };
  delete nextBindings[key];
  const next = { ...fileData };
  if (Object.keys(nextBindings).length === 0) {
    delete next[CONFIG_BINDINGS_KEY];
  } else {
    next[CONFIG_BINDINGS_KEY] = nextBindings;
  }
  return next;
}

/** Remove a literal value from file data (used when binding to env). */
export function clearFileValue(fileData: Record<string, unknown>, key: string): Record<string, unknown> {
  if (!(key in fileData)) {
    return fileData;
  }
  const next = { ...fileData };
  delete next[key];
  return next;
}

/** Whether the user already addressed this key (skip wizard re-prompt). */
export function isKeyAddressed(key: string, fileData: Record<string, unknown>, _entry: CliAppConfigEntry): boolean {
  const bindings = readBindings(fileData);
  if (bindings[key] === "skip" || bindings[key] === "env" || bindings[key] === "file") {
    return true;
  }
  return isPresent(fileData[key]);
}

/** Binding for status display; `missing` when unset. */
export function bindingForKey(
  key: string,
  fileData: Record<string, unknown>,
  resolvedPresent: boolean,
): ConfigBinding | "missing" {
  const bindings = readBindings(fileData);
  const b = bindings[key];
  if (b) return b;
  if (isPresent(fileData[key])) return "file";
  if (resolvedPresent) return "env";
  return "missing";
}
