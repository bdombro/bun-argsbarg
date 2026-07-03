/** `argsbarg create` — copy npm-shipped examples/full-example with substitutions. */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../../package.json" with { type: "json" };

export interface CreateOptions {
  key: string;
  className: string;
  tap: string;
  homepage: string;
  releaseRepo: string;
  desc: string;
  force: boolean;
  dryRun: boolean;
  check: boolean;
  diff: boolean;
  yes: boolean;
  /** Keep file:../.. dep (in-repo template). */
  devTemplate: boolean;
}

const CREATE_IDENTITY_REL = "scripts/create-identity.ts";

const EXCLUDE_REL = new Set(["bun.lock", "HOMEBREW-SCAFFOLD.md", "node_modules", "dist"]);

export function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

export function templateDir(): string {
  return join(packageRoot(), "examples/full-example");
}

export function isDevTemplateDir(baseDir: string): boolean {
  return resolve(baseDir) === resolve(templateDir());
}

export function keyToEnvPrefix(key: string): string {
  return key
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function classNameFromKey(key: string): string {
  return key
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function tapLibraryParts(tap: string): { org: string; repo: string } {
  const slash = tap.indexOf("/");
  if (slash === -1) throw new Error(`Invalid tap (expected org/repo): ${tap}`);
  return {
    org: tap.slice(0, slash),
    repo: tap.slice(slash + 1),
  };
}

/** Parse `scripts/create-identity.ts` for inference and template defaults. */
export function parseCreateIdentityFile(
  path: string,
): Partial<CreateOptions> & { envPrefix?: string } {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const pick = (field: string) => text.match(new RegExp(`${field}:\\s*"([^"]*)"`))?.[1];
  return {
    key: pick("key"),
    className: pick("className"),
    tap: pick("tap"),
    homepage: pick("homepage"),
    releaseRepo: pick("releaseRepo"),
    desc: pick("desc"),
    envPrefix: pick("envPrefix"),
  };
}

export function templateIdentity(): {
  key: string;
  className: string;
  tap: string;
  homepage: string;
  releaseRepo: string;
  desc: string;
  envPrefix: string;
} {
  const parsed = parseCreateIdentityFile(join(templateDir(), CREATE_IDENTITY_REL));
  const key = parsed.key ?? "full-example";
  return {
    key,
    className: parsed.className ?? classNameFromKey(key),
    tap: parsed.tap ?? `local/${key}`,
    homepage: parsed.homepage ?? "https://github.com/bdombro/bun-argsbarg",
    releaseRepo: parsed.releaseRepo ?? "bdombro/bun-argsbarg",
    desc: parsed.desc ?? "Argsbarg full example reference app",
    envPrefix: parsed.envPrefix ?? keyToEnvPrefix(key),
  };
}

export function inferCreateOptions(
  baseDir: string,
  partial: Partial<CreateOptions>,
): Partial<CreateOptions> {
  if (
    partial.key &&
    partial.className &&
    partial.homepage &&
    partial.releaseRepo &&
    partial.desc &&
    partial.tap
  ) {
    return partial;
  }
  const fromIdentity = parseCreateIdentityFile(join(baseDir, CREATE_IDENTITY_REL));
  return {
    key: partial.key ?? fromIdentity.key,
    className: partial.className ?? fromIdentity.className,
    desc: partial.desc ?? fromIdentity.desc,
    homepage: partial.homepage ?? fromIdentity.homepage,
    releaseRepo: partial.releaseRepo ?? fromIdentity.releaseRepo,
    tap: partial.tap ?? fromIdentity.tap,
    force: partial.force,
    dryRun: partial.dryRun,
    check: partial.check,
    diff: partial.diff,
    yes: partial.yes,
    devTemplate: partial.devTemplate,
  };
}

export function resolveCreateOptions(
  partial: Partial<CreateOptions>,
  baseDir?: string,
): CreateOptions {
  const merged = baseDir ? inferCreateOptions(baseDir, partial) : partial;
  const tmpl = templateIdentity();
  const key = merged.key ?? tmpl.key ?? "full-example";
  const className = merged.className ?? classNameFromKey(key);
  const devTemplate = merged.devTemplate ?? (baseDir ? isDevTemplateDir(baseDir) : false);
  return {
    key,
    className,
    tap: merged.tap ?? `local/${key}`,
    homepage: merged.homepage ?? `https://github.com/${merged.releaseRepo ?? `example/${key}`}`,
    releaseRepo: merged.releaseRepo ?? `example/${key}`,
    desc: merged.desc ?? `${className} CLI`,
    force: merged.force ?? false,
    dryRun: merged.dryRun ?? false,
    check: merged.check ?? false,
    diff: merged.diff ?? false,
    yes: merged.yes ?? false,
    devTemplate,
  };
}

export function renderCreateIdentitySource(opts: CreateOptions): string {
  const envPrefix = keyToEnvPrefix(opts.key);
  return `/** CLI identity — substituted by \`argsbarg create\`. */

export const createIdentity = {
  key: "${opts.key}",
  className: "${opts.className}",
  tap: "${opts.tap}",
  homepage: "${opts.homepage}",
  releaseRepo: "${opts.releaseRepo}",
  desc: "${opts.desc}",
  envPrefix: "${envPrefix}",
} as const;
`;
}

function tokenMap(opts: CreateOptions): Record<string, string> {
  const { org: tapOrg, repo: tapRepo } = tapLibraryParts(opts.tap);
  const envPrefix = keyToEnvPrefix(opts.key);
  return {
    key: opts.key,
    className: opts.className,
    envPrefix,
    tap: opts.tap,
    tapOrg,
    tapRepo,
    homepage: opts.homepage,
    releaseRepo: opts.releaseRepo,
    desc: opts.desc,
  };
}

/** Substitute \`{key}\`-style placeholders; also replace template identity literals. */
export function substituteTemplateContent(content: string, opts: CreateOptions): string {
  const tmpl = templateIdentity();
  const tokens = tokenMap(opts);
  const argsbargVersion = pkg.version;

  const protectedSpans: string[] = [];
  let out = content.replace(/\$\{[^}]+\}/g, (span) => {
    const idx = protectedSpans.length;
    protectedSpans.push(span);
    return `@@PROTECT${idx}@@`;
  });

  out = out.replace(
    /(?<!\{)\{(key|className|envPrefix|tap|tapOrg|tapRepo|homepage|releaseRepo|desc)\}(?!\})/g,
    (_, name: string) => tokens[name] ?? `{${name}}`,
  );

  const literalPairs: [string, string][] = [
    [tmpl.envPrefix, tokens.envPrefix],
    [tmpl.tap, opts.tap],
    [tmpl.releaseRepo, opts.releaseRepo],
    [tmpl.homepage, opts.homepage],
    [tmpl.desc, opts.desc],
    [tmpl.className, opts.className],
    [tmpl.key, opts.key],
    [`**${tmpl.key} conventions:**`, `**${opts.key} conventions:**`],
    ["**App-specific conventions:**", `**${opts.key} conventions:**`],
  ];
  for (const [from, to] of literalPairs) {
    if (from && from !== to) {
      out = out.split(from).join(to);
    }
  }

  out = out.replace(/@@PROTECT(\d+)@@/g, (_, idx: string) => protectedSpans[Number(idx)] ?? "");

  if (!opts.devTemplate) {
    out = out.replace(/"argsbarg":\s*"file:\.\.\/\.\."/, `"argsbarg": "^${argsbargVersion}"`);
  }

  return out;
}

function shouldExcludeRel(rel: string): boolean {
  const parts = rel.split("/");
  for (const part of parts) {
    if (EXCLUDE_REL.has(part)) return true;
  }
  return EXCLUDE_REL.has(rel);
}

function listTemplateFiles(): string[] {
  const root = templateDir();
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        if (!shouldExcludeRel(rel)) walk(full, rel);
      } else if (!shouldExcludeRel(rel)) {
        out.push(rel);
      }
    }
  };
  walk(root, "");
  return out.sort();
}

export function renderCreateTree(opts: CreateOptions): Map<string, string> {
  const files = new Map<string, string>();
  for (const rel of listTemplateFiles()) {
    if (rel === CREATE_IDENTITY_REL) {
      files.set(rel, renderCreateIdentitySource(opts));
      continue;
    }
    const src = join(templateDir(), rel);
    const raw = readFileSync(src, "utf8");
    files.set(rel, substituteTemplateContent(raw, opts));
  }
  return files;
}

export function applyCreate(baseDir: string, opts: CreateOptions): string[] {
  const written: string[] = [];
  const tree = renderCreateTree(opts);
  for (const [rel, content] of tree) {
    const dest = join(baseDir, rel);
    if (existsSync(dest) && !opts.force && !opts.check && !opts.dryRun) {
      continue;
    }
    if (opts.dryRun || opts.check) {
      written.push(dest);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, "utf8");
    written.push(dest);
  }
  return written;
}

export interface CreateDrift {
  rel: string;
  expected: string;
  actual?: string;
}

export function diffCreateDetails(baseDir: string, partial: Partial<CreateOptions>): CreateDrift[] {
  const opts = resolveCreateOptions(partial, baseDir);
  const drifts: CreateDrift[] = [];
  const tree = renderCreateTree(opts);
  for (const [rel, expected] of tree) {
    const dest = join(baseDir, rel);
    if (!existsSync(dest)) {
      drifts.push({ rel: `${rel} (missing)`, expected, actual: undefined });
      continue;
    }
    const actual = readFileSync(dest, "utf8");
    if (actual !== expected) {
      drifts.push({ rel, expected, actual });
    }
  }
  return drifts;
}

export function diffCreate(baseDir: string, partial: Partial<CreateOptions>): string[] {
  return diffCreateDetails(baseDir, partial).map((d) => d.rel);
}

/** Print a short unified diff for drifted files. */
export function printCreateDiffs(drifts: CreateDrift[], baseDir: string): void {
  for (const drift of drifts) {
    if (drift.actual === undefined) {
      process.stderr.write(`--- missing ${drift.rel}\n`);
      continue;
    }
    const relPath = drift.rel;
    process.stderr.write(`--- ${relPath}\n`);
    const expectedLines = drift.expected.split("\n");
    const actualLines = drift.actual.split("\n");
    const max = Math.max(expectedLines.length, actualLines.length);
    let shown = 0;
    for (let i = 0; i < max && shown < 12; i++) {
      const exp = expectedLines[i];
      const act = actualLines[i];
      if (exp !== act) {
        if (act !== undefined) process.stderr.write(`+ ${act}\n`);
        if (exp !== undefined) process.stderr.write(`- ${exp}\n`);
        shown++;
      }
    }
    if (max > 12) {
      process.stderr.write(`  … (${relative(baseDir, join(baseDir, relPath))})\n`);
    }
  }
}

export interface ParsedCreateArgv {
  dir: string;
  opts: Partial<CreateOptions>;
}

export function parseCreateArgv(rest: string[]): ParsedCreateArgv {
  const opts: Partial<CreateOptions> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--check") opts.check = true;
    else if (a === "--diff") opts.diff = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--yes") opts.yes = true;
    else if (a === "--key" && rest[i + 1]) opts.key = rest[++i];
    else if (a === "--class-name" && rest[i + 1]) opts.className = rest[++i];
    else if (a === "--tap" && rest[i + 1]) opts.tap = rest[++i];
    else if (a === "--homepage" && rest[i + 1]) opts.homepage = rest[++i];
    else if (a === "--release-repo" && rest[i + 1]) opts.releaseRepo = rest[++i];
    else if (a === "--desc" && rest[i + 1]) opts.desc = rest[++i];
    else if (a?.startsWith("--")) {
      throw new Error(`Unknown option: ${a}`);
    } else if (a) {
      positional.push(a);
    }
  }
  const dir = positional[0] ?? ".";
  return { dir, opts };
}
