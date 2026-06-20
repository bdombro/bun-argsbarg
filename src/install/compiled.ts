/** Test override: when set, `isCompiledExecutable()` returns this value instead of checking Bun.embeddedFiles. */
let compiledOverride: boolean | null = null;

/** @internal For tests only. */
export function setCompiledExecutableOverride(value: boolean | null): void {
  compiledOverride = value;
}

/** True when running as a `bun build --compile` binary (embedded files present). */
export function isCompiledExecutable(): boolean {
  if (compiledOverride !== null) {
    return compiledOverride;
  }
  return (Bun.embeddedFiles?.length ?? 0) > 0;
}
