#!/usr/bin/env bun
/**
 * Remove JSDoc directly above `test()` when the callback body is short.
 * Keeps `describe` JSDocs; long integration-style tests keep their comments.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;

/** Max lines from `test(` through its closing `});` to treat as a short callback. */
const MAX_SHORT_TEST_SPAN = 12;

function isTestJsdocLine(line: string): boolean {
  return /^\s*\/\*\*[^*]/.test(line) && line.trimEnd().endsWith("*/");
}

function testBlockSpan(lines: string[], testIndex: number): number {
  let depth = 0;
  let started = false;
  for (let i = testIndex; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
      }
    }
    if (started && depth === 0) {
      return i - testIndex + 1;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function transform(content: string): string {
  const lines = content.split("\n");
  const remove = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*test\s*\(/.test(lines[i])) continue;
    if (i === 0 || !isTestJsdocLine(lines[i - 1])) continue;
    const span = testBlockSpan(lines, i);
    if (span <= MAX_SHORT_TEST_SPAN) {
      remove.add(i - 1);
    }
  }

  if (remove.size === 0) return content;
  return `${lines.filter((_, idx) => !remove.has(idx)).join("\n")}\n`;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, acc);
    else if (name.endsWith(".test.ts")) acc.push(path);
  }
  return acc;
}

let changed = 0;
for (const path of walk(ROOT)) {
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
    console.log(relative(ROOT, path));
  }
}
console.log(`stripped short test JSDocs in ${changed} file(s)`);
