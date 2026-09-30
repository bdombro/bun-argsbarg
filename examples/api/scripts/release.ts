/*
Release script (`just release <major|minor|patch> [--yes] [--dry-run]`).
Runs tests, bumps `package.json`, promotes the changelog, commits, tags, pushes, and runs
`npm publish`. `--dry-run` prints the plan and changes nothing; without `--yes` it asks before touching anything.
*/

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";

/** Allowed semver bump kinds. */
type Bump = "major" | "minor" | "patch";

/** Parsed command-line options. */
interface ReleaseOptions {
  /** Which semver component to bump. */
  bump: Bump;
  /** Skip the confirmation prompt. */
  yes: boolean;
  /** Print the plan without changing anything. */
  dryRun: boolean;
}

/** Runs a command with inherited stdio; exits the script when it fails. */
function run(
  /** Executable name. */
  cmd: string,
  /** Arguments. */
  args: string[],
): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

/** Parses argv into release options, or prints usage and exits. */
function parseOptions(argv: string[]): ReleaseOptions {
  const bump = argv.find((a): a is Bump => a === "major" || a === "minor" || a === "patch");
  const unknown = argv.filter((a) => a.startsWith("--") && a !== "--yes" && a !== "--dry-run");
  if (!bump || unknown.length > 0) {
    process.stderr.write("Usage: just release <major|minor|patch> [--yes] [--dry-run]\n");
    process.exit(1);
  }
  return { bump, yes: argv.includes("--yes"), dryRun: argv.includes("--dry-run") };
}

/** Applies a semver bump to `current`. */
function applyBump(current: string, bump: Bump): string {
  const [major, minor, patch] = current.split(".").map(Number) as [number, number, number];
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Asks for confirmation on a TTY; exits when not confirmed or when stdin is not a TTY. */
async function confirm(question: string): Promise<void> {
  if (!input.isTTY) {
    process.stderr.write("Not a TTY; pass --yes to confirm the release.\n");
    process.exit(1);
  }
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }
}

const options = parseOptions(process.argv.slice(2));
const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name: string; version: string };
const next = applyBump(pkg.version, options.bump);

if (options.dryRun) {
  console.log(
    `[dry-run] Would run tests, bump ${pkg.version} → ${next}, update the changelog, build, commit, tag v${next}, push, and npm publish ${pkg.name}@${next}. Nothing was changed.`,
  );
  process.exit(0);
}
if (!options.yes) {
  await confirm(`Release ${pkg.name}@${next} (commit, tag, push, npm publish)?`);
}

run("just", ["test"]);
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
const changelog = readFileSync("CHANGELOG.md", "utf8");
const date = new Date().toISOString().slice(0, 10);
writeFileSync("CHANGELOG.md", changelog.replace(/^## \[Unreleased\]/m, `## [Unreleased]\n\n## [${next}] - ${date}`));
run("just", ["build"]);
run("git", ["add", "-A"]);
run("git", ["commit", "-m", `chore: release v${next}`]);
run("git", ["tag", `v${next}`]);
run("git", ["push"]);
run("git", ["push", "origin", `v${next}`]);
run("npm", ["publish"]);
console.log(`Released ${pkg.name}@${next}`);
