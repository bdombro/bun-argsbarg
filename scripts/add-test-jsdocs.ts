#!/usr/bin/env bun
/**
 * One-shot helper: add file headers and JSDoc above describe and test blocks
 * in src test files when missing. Run after updating the JSDoc style rule.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;

/** Turn a describe/test title into a short human-readable JSDoc sentence. */
function jsdocForBlock(kind: "describe" | "test", title: string): string {
  const t = title.trim();
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  if (kind === "describe") {
    if (/tests?$/i.test(t)) return `/** ${cap}. */`;
    return `/** Tests for ${t}. */`;
  }
  if (
    /^(ensure|verifies|verify|rejects|reject|parses|parse|builds|build|detects|detect|includes|include|omits|omit|defaults|default|exports|export|lists|list|prints|print|writes|write|reads|read|applies|apply|merges|merge|runs|run|supports|support|keeps|keep|escapes|escape|stops|stop|missing|provided|invalid|valid|all|bare|scoped|interactive|leaf|root|nested|varargs|enum|mcp|cli|docs|completion|configure|sync|remove|status|greenfield|symmetric|normalizes|normalize|resolves|resolve|wants|formula|plugin|skill|global|rimraf|claude|cursor|codex|openclaw|opencode|chatgpt|presentation|builtin|capabilities|headless|hidden|zip|env|integration|create|smoke|placement|gh-release|file|context|validate|formats|invoke|api-guide|mcp-resources)/i.test(
      t,
    )
  ) {
    return `/** ${cap}. */`;
  }
  return `/** Tests that ${t}. */`;
}

function fileHeader(relPath: string): string {
  const name = relative(ROOT, relPath);
  return `/*
Tests for ${name.replace(/\.test\.ts$/, "")} module behavior.
*/
`;
}

function hasJsdocAbove(lines: string[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    return line.endsWith("*/") || line.startsWith("*");
  }
  return false;
}

function transform(content: string, relPath: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let i = 0;

  if (!lines[0]?.trimStart().startsWith("/*")) {
    out.push(fileHeader(relPath).trimEnd(), "");
  } else {
    while (i < lines.length) {
      out.push(lines[i]);
      if (lines[i].trimEnd().endsWith("*/")) {
        i++;
        break;
      }
      i++;
    }
    if (i < lines.length && lines[i].trim() === "") {
      out.push(lines[i]);
      i++;
    }
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)(describe|test)\(\s*["'`]([^"'`]+)["'`]/);
    if (m && !hasJsdocAbove(out, out.length)) {
      out.push(`${m[1]}${jsdocForBlock(m[2] as "describe" | "test", m[3])}`);
    }
    out.push(line);
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
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
  const after = transform(before, path);
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
    console.log(relative(ROOT, path));
  }
}
console.log(`updated ${changed} file(s)`);
