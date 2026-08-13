/** `argsbarg create` — copy npm-shipped example templates with substitutions. */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../../package.json" with { type: "json" };

export type CreateTemplateId = "cli" | "json";

export interface CreateTemplateSpec {
  id: CreateTemplateId;
  dirName: string;
  displayName: string;
  description: string;
}

export const CREATE_TEMPLATES: CreateTemplateSpec[] = [
  {
    id: "cli",
    dirName: "full-example",
    displayName: "full-example",
    description: "Production CLI with MCP, HTTP, configure, and skills. Options and flags only; no schemagen.",
  },
  {
    id: "json",
    dirName: "full-example-json",
    displayName: "full-example-json",
    description: "Same shell plus @sg schemagen, input/outputSchema validation, JSON HTTP leaves, and REST CRUD demo.",
  },
];

export function normalizeCreateTemplateId(value: string | undefined): CreateTemplateId {
  return value === "json" ? "json" : "cli";
}

export function templateDirFor(templateId: CreateTemplateId): string {
  const spec = CREATE_TEMPLATES.find((t) => t.id === templateId);
  if (!spec) {
    throw new Error(`Unknown create template: ${templateId}`);
  }
  return join(packageRoot(), "examples", spec.dirName);
}

export interface CreateOptions {
  templateId: CreateTemplateId;
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

export function templateDir(templateId: CreateTemplateId = "cli"): string {
  return templateDirFor(templateId);
}

export function devTemplateIdForDir(baseDir: string): CreateTemplateId | undefined {
  const resolved = resolve(baseDir);
  for (const spec of CREATE_TEMPLATES) {
    if (resolved === resolve(templateDirFor(spec.id))) {
      return spec.id;
    }
  }
  return undefined;
}

export function isDevTemplateDir(baseDir: string, templateId?: CreateTemplateId): boolean {
  if (templateId) {
    return resolve(baseDir) === resolve(templateDirFor(templateId));
  }
  return devTemplateIdForDir(baseDir) !== undefined;
}

export function keyToEnvPrefix(key: string): string {
  return key
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/** PascalCase Homebrew formula class from CLI key; prefix `App` when Ruby constant rules require it. */
export function classNameFromKey(key: string): string {
  const name = key
    .split(/[-_]/)
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  if (name.length === 0) {
    throw new Error(`Invalid CLI key: ${key}`);
  }
  if (!/^[A-Z]/.test(name)) {
    return `App${name}`;
  }
  return name;
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
): Partial<CreateOptions> & { envPrefix?: string; template?: string } {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const pick = (field: string) => text.match(new RegExp(`${field}:\\s*"([^"]*)"`))?.[1];
  const templateRaw = text.match(/template:\s*"(cli|json)"/)?.[1];
  return {
    key: pick("key"),
    className: pick("className"),
    tap: pick("tap"),
    homepage: pick("homepage"),
    releaseRepo: pick("releaseRepo"),
    desc: pick("desc"),
    envPrefix: pick("envPrefix"),
    template: templateRaw,
    templateId: templateRaw ? normalizeCreateTemplateId(templateRaw) : undefined,
  };
}

export function templateIdentity(templateId: CreateTemplateId = "cli"): {
  templateId: CreateTemplateId;
  key: string;
  className: string;
  tap: string;
  homepage: string;
  releaseRepo: string;
  desc: string;
  envPrefix: string;
} {
  const parsed = parseCreateIdentityFile(join(templateDirFor(templateId), CREATE_IDENTITY_REL));
  const key = parsed.key ?? CREATE_TEMPLATES.find((t) => t.id === templateId)?.displayName ?? "full-example";
  return {
    templateId,
    key,
    className: parsed.className ?? classNameFromKey(key),
    tap: parsed.tap ?? `local/${key}`,
    homepage: parsed.homepage ?? "https://github.com/bdombro/bun-argsbarg",
    releaseRepo: parsed.releaseRepo ?? "bdombro/bun-argsbarg",
    desc: parsed.desc ?? "Argsbarg copy template",
    envPrefix: parsed.envPrefix ?? keyToEnvPrefix(key),
  };
}

export function inferCreateOptions(baseDir: string, partial: Partial<CreateOptions>): Partial<CreateOptions> {
  if (partial.key && partial.className && partial.homepage && partial.releaseRepo && partial.desc && partial.tap) {
    return partial;
  }
  const fromIdentity = parseCreateIdentityFile(join(baseDir, CREATE_IDENTITY_REL));
  return {
    templateId: partial.templateId ?? fromIdentity.templateId,
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

function assertReleaseRepoFormat(releaseRepo: string): void {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(releaseRepo)) {
    throw new Error(`Invalid release repo (expected org/repo): ${releaseRepo}`);
  }
}

export function resolveCreateOptions(partial: Partial<CreateOptions>, baseDir?: string): CreateOptions {
  const merged = baseDir ? inferCreateOptions(baseDir, partial) : partial;
  const templateId = normalizeCreateTemplateId(
    merged.templateId ?? (baseDir ? devTemplateIdForDir(baseDir) : undefined),
  );
  const tmpl = templateIdentity(templateId);
  const key = merged.key ?? tmpl.key ?? "full-example";
  const className = merged.className ?? classNameFromKey(key);
  const releaseRepo = merged.releaseRepo;
  if (!releaseRepo) {
    throw new Error("GitHub release repo (org/repo) is required. Pass --release-repo or use the interactive wizard.");
  }
  assertReleaseRepoFormat(releaseRepo);
  const devTemplate = merged.devTemplate ?? (baseDir ? isDevTemplateDir(baseDir, templateId) : false);
  return {
    templateId,
    key,
    className,
    tap: merged.tap ?? releaseRepo,
    homepage: merged.homepage ?? `https://github.com/${releaseRepo}`,
    releaseRepo,
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
  template: "${opts.templateId}",
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
  const tmpl = templateIdentity(opts.templateId);
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
    out = out
      .replace(/"argsbarg":\s*"workspace:\*"/, `"argsbarg": "^${argsbargVersion}"`)
      .replace(/"argsbarg":\s*"file:\.\.\/\.\."/, `"argsbarg": "^${argsbargVersion}"`);
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

function listTemplateFiles(templateId: CreateTemplateId): string[] {
  const root = templateDirFor(templateId);
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
  for (const rel of listTemplateFiles(opts.templateId)) {
    if (rel === CREATE_IDENTITY_REL) {
      files.set(rel, renderCreateIdentitySource(opts));
      continue;
    }
    const src = join(templateDirFor(opts.templateId), rel);
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
    else if (a === "--template" && rest[i + 1]) opts.templateId = normalizeCreateTemplateId(rest[++i]);
    else if (a?.startsWith("--")) {
      throw new Error(`Unknown option: ${a}`);
    } else if (a) {
      positional.push(a);
    }
  }
  const dir = positional[0] ?? ".";
  return { dir, opts };
}
