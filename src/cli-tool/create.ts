/** `argsbarg create` — copy npm-shipped example templates with substitutions. */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Template key: the template's directory under `examples/` (also its example app key). */
export type CreateTemplateId = "cli" | "api" | "agent-plugin" | "homebrew";

/** Default template for `argsbarg create`. */
export const DEFAULT_CREATE_TEMPLATE: CreateTemplateId = "cli";

/** One copy template shipped under `examples/`. */
export interface CreateTemplateSpec {
  /** Template key and directory name under `examples/`. */
  id: CreateTemplateId;
  /** Short label for `--template` help (e.g. `options/flags`). */
  summary: string;
  /** One-line description for the interactive picker. */
  description: string;
  /** Package manager post-create runs (`npm` templates need only Node; `bun` for the Homebrew template). */
  packageManager: "npm" | "bun";
}

/** Copy templates shipped under `examples/`, in picker order. */
export const CREATE_TEMPLATES: CreateTemplateSpec[] = [
  {
    id: "cli",
    summary: "npm/npx CLI",
    description: "npm/npx CLI with MCP and HTTP. Options and flags only; no schemas. Needs only Node.",
    packageManager: "npm",
  },
  {
    id: "api",
    summary: "Zod schemas, REST CRUD",
    description:
      "Same npm shell plus Zod inputSchema/outputSchema, typed command inputs, JSON HTTP commands, and a REST CRUD demo.",
    packageManager: "npm",
  },
  {
    id: "agent-plugin",
    summary: "MCP plugin",
    description: "Agent MCP plugin for Cursor and Claude Code marketplaces, with a committed Node bundle.",
    packageManager: "npm",
  },
  {
    id: "homebrew",
    summary: "Homebrew binary",
    description: "Minimal Bun-compiled binary distributed through a Homebrew formula and tap.",
    packageManager: "bun",
  },
];

/** Maps a raw template string (identity file, argv) to a known template key, else the default. */
export function normalizeCreateTemplateId(value: string | undefined): CreateTemplateId {
  return CREATE_TEMPLATES.find((t) => t.id === value)?.id ?? DEFAULT_CREATE_TEMPLATE;
}

export function templateDirFor(templateId: CreateTemplateId): string {
  const spec = CREATE_TEMPLATES.find((t) => t.id === templateId);
  if (!spec) {
    throw new Error(`Unknown create template: ${templateId}`);
  }
  return join(packageRoot(), "examples", spec.id);
}

export interface CreateOptions {
  templateId: CreateTemplateId;
  key: string;
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

/** Identity file every template ships (key, release repo, description, template id). */
const CREATE_IDENTITY_REL = "src/create-identity.ts";

/** Paths never copied from a template (lockfiles, installs, and build output). */
const EXCLUDE_REL = new Set(["bun.lock", "package-lock.json", "node_modules", "dist"]);

/** Argsbarg package root (two levels above this file in both `src/` and the compiled `dist/`). */
export function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

/** Argsbarg package version, read from `package.json` at the package root. */
export function argsbargPackageVersion(): string {
  return (JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8")) as { version: string }).version;
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

/**
 * PascalCase Homebrew formula class from a CLI key (prefix `App` when Ruby constant rules require it). Only used to
 * rewrite the Homebrew template's committed formula; the template derives it the same way in `scripts/formula-shared.ts`.
 */
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

/** Parse `src/create-identity.ts` for inference and template defaults. */
export function parseCreateIdentityFile(path: string): Partial<CreateOptions> & { template?: string } {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const pick = (field: string) => text.match(new RegExp(`${field}:\\s*"([^"]*)"`))?.[1];
  const templateRaw = text.match(/template:\s*"([a-z-]+)"/)?.[1];
  return {
    key: pick("key"),
    releaseRepo: pick("releaseRepo"),
    desc: pick("desc"),
    template: templateRaw,
    templateId: templateRaw ? normalizeCreateTemplateId(templateRaw) : undefined,
  };
}

/** Identity literals of a shipped template (what `create` rewrites in copied files). */
export function templateIdentity(templateId: CreateTemplateId = DEFAULT_CREATE_TEMPLATE): {
  templateId: CreateTemplateId;
  key: string;
  releaseRepo: string;
  desc: string;
} {
  const parsed = parseCreateIdentityFile(join(templateDirFor(templateId), CREATE_IDENTITY_REL));
  return {
    templateId,
    key: parsed.key ?? templateId,
    releaseRepo: parsed.releaseRepo ?? "bdombro/bun-argsbarg",
    desc: parsed.desc ?? "Argsbarg copy template",
  };
}

export function inferCreateOptions(baseDir: string, partial: Partial<CreateOptions>): Partial<CreateOptions> {
  if (partial.key && partial.releaseRepo && partial.desc) {
    return partial;
  }
  const fromIdentity = parseCreateIdentityFile(join(baseDir, CREATE_IDENTITY_REL));
  return {
    templateId: partial.templateId ?? fromIdentity.templateId,
    key: partial.key ?? fromIdentity.key,
    desc: partial.desc ?? fromIdentity.desc,
    releaseRepo: partial.releaseRepo ?? fromIdentity.releaseRepo,
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
  const key = merged.key ?? tmpl.key ?? "cli";
  const releaseRepo = merged.releaseRepo;
  if (!releaseRepo) {
    throw new Error("GitHub release repo (org/repo) is required. Pass --release-repo or use the interactive wizard.");
  }
  assertReleaseRepoFormat(releaseRepo);
  const devTemplate = merged.devTemplate ?? (baseDir ? isDevTemplateDir(baseDir, templateId) : false);
  return {
    templateId,
    key,
    releaseRepo,
    desc: merged.desc ?? `${key} CLI`,
    force: merged.force ?? false,
    dryRun: merged.dryRun ?? false,
    check: merged.check ?? false,
    diff: merged.diff ?? false,
    yes: merged.yes ?? false,
    devTemplate,
  };
}

/** Renders `src/create-identity.ts` for a new project. */
export function renderCreateIdentitySource(opts: CreateOptions): string {
  return `/** CLI identity — substituted by \`argsbarg create\`. */

export const createIdentity = {
  key: "${opts.key}",
  releaseRepo: "${opts.releaseRepo}",
  desc: "${opts.desc}",
  template: "${opts.templateId}",
} as const;
`;
}

/**
 * Trailing comment marking a template line that only makes sense inside the argsbarg repo (e.g. the
 * `.bin/argsbarg` symlink fix for `file:../..` installs). `create` drops these lines from new projects.
 */
export const DEV_ONLY_MARKER = "# argsbarg-dev-only";

/** Substitute \`{key}\`-style placeholders; also replace template identity literals. */
export function substituteTemplateContent(content: string, opts: CreateOptions): string {
  const tmpl = templateIdentity(opts.templateId);
  const tokens: Record<string, string> = { key: opts.key, releaseRepo: opts.releaseRepo, desc: opts.desc };
  const argsbargVersion = argsbargPackageVersion();

  const protectedSpans: string[] = [];
  let out = content.replace(/\$\{[^}]+\}/g, (span) => {
    const idx = protectedSpans.length;
    protectedSpans.push(span);
    return `@@PROTECT${idx}@@`;
  });

  out = out.replace(/(?<!\{)\{(key|releaseRepo|desc)\}(?!\})/g, (_, name: string) => tokens[name] ?? `{${name}}`);

  const literalPairs: [string, string][] = [
    [tmpl.releaseRepo, opts.releaseRepo],
    [tmpl.desc, opts.desc],
    [classNameFromKey(tmpl.key), classNameFromKey(opts.key)],
    [tmpl.key, opts.key],
    [`## ${tmpl.key} conventions`, `## ${opts.key} conventions`],
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
      .split("\n")
      .filter((line) => !line.includes(DEV_ONLY_MARKER))
      .join("\n")
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
  const tmpl = templateIdentity(opts.templateId);
  const files = new Map<string, string>();
  for (const rel of listTemplateFiles(opts.templateId)) {
    if (rel === CREATE_IDENTITY_REL) {
      files.set(rel, renderCreateIdentitySource(opts));
      continue;
    }
    const src = join(templateDirFor(opts.templateId), rel);
    const raw = readFileSync(src, "utf8");
    const targetRel = rel.startsWith(`skills/${tmpl.key}/`)
      ? rel.replace(`skills/${tmpl.key}/`, `skills/${opts.key}/`)
      : rel === `Formula/${tmpl.key}.rb`
        ? `Formula/${opts.key}.rb`
        : rel;
    files.set(targetRel, substituteTemplateContent(raw, opts));
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
