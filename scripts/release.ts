#!/usr/bin/env bun
/**
 * Release workflow: bump semver; update CHANGELOG; commit, tag, push, GitHub release, npm publish.
 *
 * **Run `just test` (or the individual `just check-types`, `just lint`, `bun test`) before this
 * script** — it does not typecheck, lint, or run tests. The `just release` recipe runs checks first.
 *
 * Usage: `bun scripts/release.ts <major|minor|patch>` (usually via `just release <bump>`.)
 *
 * Requires: `git`, `gh` (authenticated), `npm` logged in for publish. The release commit stages **all**
 * repo changes (`git add -A`), not only the version and CHANGELOG edits from this script.
 */

import { unlink } from "fs/promises";

/** Returns the parent directory of an absolute file path. */
function parentDir(absolute: string): string {
  const s = absolute.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  if (i <= 0) {
    return s;
  }
  return s.slice(0, i);
}

/** Monorepo root: parent of `scripts/` (directory of this file). */
const repoRoot = parentDir(import.meta.dir);

/** Which semver segment to increment for the next release. */
type Bump = "major" | "minor" | "patch";

/** Prints usage to stderr and exits with status 1. */
function usage(): never {
  console.error("Usage: bun scripts/release.ts <major|minor|patch>");
  process.exit(1);
}

/** Parses the release bump level from argv; exits on invalid input. */
function parseBump(s: string | undefined): Bump {
  if (s === "major" || s === "minor" || s === "patch") {
    return s;
  }
  usage();
}

/** Returns the next `x.y.z` version for the given `major` | `minor` | `patch` segment. */
function bumpSemver(version: string, part: Bump): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) {
    throw new Error(`package.json version must be semver x.y.z, got: ${JSON.stringify(version)}`);
  }
  let major = Number(m[1]);
  let minor = Number(m[2]);
  let patch = Number(m[3]);
  if (part === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (part === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

/** Runs a subprocess, inheriting stdio, and exits the process on non-zero status. */
function run(label: string, cmd: string[], cwd: string = repoRoot): void {
  console.log(`\n→ ${label}: ${cmd.join(" ")}`);
  const proc = Bun.spawnSync({ cmd, cwd, stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    console.error(`\n${label} failed (exit ${proc.exitCode})`);
    process.exit(proc.exitCode ?? 1);
  }
}

/** Moves `[Unreleased]` content under a new `## [version] - date` heading and leaves an empty Unreleased. */
function promoteChangelog(content: string, version: string, date: string): string {
  const header = "## [Unreleased]";
  const idx = content.indexOf(header);
  if (idx === -1) {
    throw new Error("CHANGELOG.md: missing ## [Unreleased] section");
  }
  const lineEnd = content.indexOf("\n", idx);
  if (lineEnd === -1) {
    throw new Error("CHANGELOG.md: malformed after [Unreleased]");
  }
  const bodyStart = lineEnd + 1;
  const nextIdx = content.indexOf("\n## [", bodyStart);
  const body =
    nextIdx === -1 ? content.slice(bodyStart).trimEnd() : content.slice(bodyStart, nextIdx).trimEnd();
  const tail = nextIdx === -1 ? "" : content.slice(nextIdx + 1);
  const before = content.slice(0, idx);
  const newBlock = `${header}\n\n## [${version}] - ${date}\n${body}\n\n`;
  return before + newBlock + tail;
}

/** Returns the markdown body of one version section for `gh release` notes. */
function extractReleaseNotes(nextChangelog: string, version: string, date: string): string {
  const verHeader = `## [${version}] - ${date}`;
  const ni = nextChangelog.indexOf(verHeader);
  if (ni === -1) {
    throw new Error("internal: promoted version header not found in CHANGELOG");
  }
  const nextHdrAt = nextChangelog.indexOf("\n## [", ni + verHeader.length);
  if (nextHdrAt === -1) {
    return nextChangelog.slice(ni).trimEnd();
  }
  return nextChangelog.slice(ni, nextHdrAt).trimEnd();
}

/** Joins a root path and a file segment with a single path separator. */
function joinFile(root: string, segment: string): string {
  const r = root.replace(/[/\\]+$/, "");
  return `${r}/${segment}`;
}

const bump = parseBump(process.argv[2]);

const pkgPath = joinFile(repoRoot, "package.json");
const pkgText = await Bun.file(pkgPath).text();
const pkg = JSON.parse(pkgText) as { name: string; version: string };
const nextVersion = bumpSemver(pkg.version, bump);
const releaseDate = new Date().toISOString().slice(0, 10);

pkg.version = nextVersion;
await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const changelogPath = joinFile(repoRoot, "CHANGELOG.md");
const changelog = await Bun.file(changelogPath).text();
const nextChangelog = promoteChangelog(changelog, nextVersion, releaseDate);
await Bun.write(changelogPath, nextChangelog);

const notesPath = joinFile(repoRoot, ".release-notes.tmp.md");
const notesContent = extractReleaseNotes(nextChangelog, nextVersion, releaseDate);
await Bun.write(notesPath, `${notesContent}\n`);

const tag = `v${nextVersion}`;
const msg = `release ${tag}`;

try {
  run("git add (all)", ["git", "add", "-A"], repoRoot);
  run("git commit", ["git", "commit", "-m", msg], repoRoot);
  run("git tag", ["git", "tag", "-a", tag, "-m", msg], repoRoot);
  run("git push", ["git", "push"], repoRoot);
  run("git push tags", ["git", "push", "--tags"], repoRoot);
  run("gh release", ["gh", "release", "create", tag, "--title", tag, "--notes-file", notesPath], repoRoot);
  run("npm publish", ["npm", "publish"], repoRoot);
} finally {
  await unlink(notesPath).catch(() => {});
}

console.log(`\nDone: published ${pkg.name}@${nextVersion} (${tag}).`);
