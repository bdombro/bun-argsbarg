#!/usr/bin/env bun
/*
Bump version, build standalone Node MCP server, and publish release tag.
*/

import * as fs from "node:fs";
import { $ } from "bun";

/** Allowed semver bump kinds for `scripts/release.ts`. */
type Bump = "major" | "minor" | "patch";

/** Parsed command-line options for release. */
interface ReleaseOptions {
  /** Semver segment to increment. */
  bump?: Bump;
  /** Whether running in dry-run mode. */
  dryRun: boolean;
  /** Whether confirmation is skipped. */
  yes: boolean;
}

/** Path to program entrypoint defining the version. */
const programPath = "src/program.ts";

/** Path to Cursor plugin manifest. */
const cursorManifestPath = ".cursor-plugin/plugin.json";

/** Path to Claude Code plugin manifest. */
const claudeManifestPath = ".claude-plugin/plugin.json";

/** Entry point: release bump. */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options.bump) {
    usage();
  }
  await runRelease(options.bump, options);
}

/** Prints usage and exits. */
function usage(): never {
  process.stderr.write(
    "Usage:\n" +
      "  bun scripts/release.ts <major|minor|patch> [--yes] [--dry-run]\n",
  );
  process.exit(1);
}

/**
 * Parses argv into release options.
 */
function parseOptions(
  /** Command line arguments. */
  argv: string[],
): ReleaseOptions {
  const yes = argv.includes("--yes");
  const dryRun = argv.includes("--dry-run");
  const bump = argv.find((a): a is Bump => a === "major" || a === "minor" || a === "patch");
  for (const arg of argv) {
    if (arg.startsWith("--") && arg !== "--yes" && arg !== "--dry-run") {
      usage();
    }
  }
  if (!bump) {
    usage();
  }
  return { bump, dryRun, yes };
}

/**
 * Full release pipeline for a semver bump.
 */
async function runRelease(
  /** Increment segment. */
  bump: Bump,
  /** Parsed CLI options. */
  options: ReleaseOptions,
): Promise<void> {
  const testResult = await $`just test`.nothrow();
  if (testResult.exitCode !== 0) process.exit(testResult.exitCode);

  const currentVersion = readCurrentVersion();
  const newVersion = applyBump(currentVersion, bump);
  console.log(`Releasing ${currentVersion} → ${newVersion}`);

  updateVersion(newVersion);
  updateChangelog(newVersion);

  const buildResult = await $`just build`.nothrow();
  if (buildResult.exitCode !== 0) process.exit(buildResult.exitCode);

  const docgenResult = await $`just docgen`.nothrow();
  if (docgenResult.exitCode !== 0) process.exit(docgenResult.exitCode);

  if (options.dryRun) {
    console.log(`[dry-run] Would commit, tag v${newVersion}, and create GitHub release.`);
    return;
  }

  await commitAndTag(newVersion);
  await createGithubRelease(`v${newVersion}`);

  console.log(`Released v${newVersion}`);
}

/**
 * Reads the current version string from src/program.ts.
 */
function readCurrentVersion(): string {
  const content = fs.readFileSync(programPath, "utf-8");
  const match = /version:\s*"([^"]+)"/.exec(content);
  if (!match) {
    process.stderr.write(`Could not read version from ${programPath}\n`);
    process.exit(1);
  }
  const version = match[1];
  if (!version) {
    process.stderr.write(`Could not read version from ${programPath}\n`);
    process.exit(1);
  }
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    process.stderr.write(`Invalid semver in ${programPath}: ${version}\n`);
    process.exit(1);
  }
  return version;
}

/**
 * Increments semver according to the specified bump level.
 */
function applyBump(
  /** Existing version string. */
  version: string,
  /** Semver segment to increment. */
  bump: Bump,
): string {
  const parts = version.split(".").map(Number) as [number, number, number];
  if (bump === "major") {
    return `${parts[0] + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${parts[0]}.${parts[1] + 1}.0`;
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

/**
 * Updates version in package.json, program.ts, and plugin manifests.
 */
function updateVersion(
  /** Incremented version string. */
  newVersion: string,
): void {
  const pkgPath = "package.json";
  const pkgContent = fs.readFileSync(pkgPath, "utf-8");
  fs.writeFileSync(
    pkgPath,
    pkgContent.replace(/"version":\s*"[^"]+"/, `"version": "${newVersion}"`),
  );

  const progContent = fs.readFileSync(programPath, "utf-8");
  fs.writeFileSync(
    programPath,
    progContent.replace(/version:\s*"[^"]+"/, `version: "${newVersion}"`),
  );

  if (fs.existsSync(cursorManifestPath)) {
    const cursorContent = fs.readFileSync(cursorManifestPath, "utf-8");
    fs.writeFileSync(
      cursorManifestPath,
      cursorContent.replace(/"version":\s*"[^"]+"/, `"version": "${newVersion}"`),
    );
  }

  if (fs.existsSync(claudeManifestPath)) {
    const claudeContent = fs.readFileSync(claudeManifestPath, "utf-8");
    fs.writeFileSync(
      claudeManifestPath,
      claudeContent.replace(/"version":\s*"[^"]+"/, `"version": "${newVersion}"`),
    );
  }
}

/**
 * Prepends the new release section with date under [Unreleased] in CHANGELOG.md.
 */
function updateChangelog(
  /** Incremented version string. */
  newVersion: string,
): void {
  const changelogPath = "CHANGELOG.md";
  const content = fs.readFileSync(changelogPath, "utf-8");
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    changelogPath,
    content.replace(/^## \[Unreleased\]/m, `## [Unreleased]\n\n## [${newVersion}] - ${date}`),
  );
}

/**
 * Stages all changes, creates a release commit, tags it, and pushes to remote.
 */
async function commitAndTag(
  /** Incremented version string. */
  newVersion: string,
): Promise<void> {
  await $`git add -A`;
  await $`git commit -m ${`chore: release v${newVersion}`}`;
  await $`git tag v${newVersion}`;
  await $`git push`;
  await $`git push origin v${newVersion}`;
}

/**
 * Creates a release on GitHub.
 */
async function createGithubRelease(
  /** Git release tag. */
  tag: string,
): Promise<void> {
  await $`gh release create ${tag} --title ${tag} --generate-notes`;
}

await main();
