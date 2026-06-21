import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CliUpdateGetLatest } from "../types.ts";

/** Config for {@link ghReleaseUpdateGetLatest}. */
export interface GhReleaseUpdateConfig {
  /** GitHub `owner/repo` slug. */
  repo: string;
  /** Release asset filename (e.g. `myapp`). */
  asset: string;
  /** Temp directory name prefix for downloads. */
  tempPrefix: string;
  /** Path to the on-disk version-check cache JSON file. */
  cachePath: string;
  /** Optional hint when `gh auth` fails or no releases exist. */
  repoEnvHint?: string;
}

/** Config for {@link createGhVersionCheck}. */
export interface GhVersionCheckConfig {
  /** Installed semver string. */
  currentVersion: string;
  /** CLI command name for update notices (e.g. `qa`). */
  commandName: string;
  /** Path to the on-disk version-check cache JSON file. */
  cachePath: string;
  /** Cache TTL in milliseconds (default 24h). */
  ttlMs?: number;
  /** When true, skip background refresh (e.g. test subprocess). */
  skipRefresh?: () => boolean;
  /** When true, skip refresh because `gh` is unavailable. */
  ghAvailable?: () => boolean;
  /** Fetches latest release version via `gh`. */
  fetchLatest: () => Promise<string>;
}

type VersionCheckCache = {
  fetchedAt: number;
  latest: string;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Returns whether the installed version matches the latest release. */
export function isAlreadyCurrent(current: string, latest: string): boolean {
  return current === latest;
}

/** Strips a leading `v` from a release tag. */
export function parseReleaseTag(tag: string): string {
  const trimmed = tag.trim();
  if (!trimmed) {
    throw new Error("Release tag is empty");
  }
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

/** Builds a `CliUpdateGetLatest` hook that downloads a release via `gh`. */
export function ghReleaseUpdateGetLatest(config: GhReleaseUpdateConfig): CliUpdateGetLatest {
  const fetchLatest = createGhFetchLatest(config);

  return async ({ version }) => {
    ensureGhAvailable();

    const latestVersion = await fetchLatest();
    if (isAlreadyCurrent(version, latestVersion)) {
      return { path: process.execPath, version: latestVersion };
    }

    const tempDir = mkdtempSync(join(tmpdir(), config.tempPrefix));
    try {
      const downloadedPath = await downloadReleaseAsset(config, tempDir);
      chmodSync(downloadedPath, 0o755);
      writeVersionCheckCache(config.cachePath, { fetchedAt: Date.now(), latest: latestVersion });
      return {
        path: downloadedPath,
        version: latestVersion,
        cleanup: () => {
          rmSync(tempDir, { recursive: true, force: true });
        },
      };
    } catch (err) {
      rmSync(tempDir, { recursive: true, force: true });
      throw err;
    }
  };
}

/** Version-check cache helpers for summary notices and background refresh. */
export function createGhVersionCheck(config: GhVersionCheckConfig): {
  getUpdateNotice: () => string | null;
  refreshIfStale: () => void;
} {
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const ghAvailable = config.ghAvailable ?? (() => Bun.which("gh") !== null);

  return {
    getUpdateNotice(): string | null {
      const cached = readVersionCheckCache(config.cachePath);
      if (cached === null || isAlreadyCurrent(config.currentVersion, cached.latest)) {
        return null;
      }
      return `Update available: v${cached.latest} (you have v${config.currentVersion}). Run \`${config.commandName} update\``;
    },

    refreshIfStale(): void {
      if (config.skipRefresh?.()) return;
      if (!ghAvailable()) return;

      const cached = readVersionCheckCache(config.cachePath);
      if (cached !== null && Date.now() - cached.fetchedAt < ttlMs) {
        return;
      }

      void config.fetchLatest()
        .then((latest) => {
          writeVersionCheckCache(config.cachePath, { fetchedAt: Date.now(), latest });
        })
        .catch(() => {
          // Best-effort; summary must never fail because of a version check.
        });
    },
  };
}

/** Shared `gh release view` fetcher for hooks and version-check refresh. */
export function createGhFetchLatest(config: Pick<GhReleaseUpdateConfig, "repo" | "repoEnvHint">): () => Promise<string> {
  return async () => {
    const result = await runGh([
      "release",
      "view",
      "--repo",
      config.repo,
      "--json",
      "tagName",
    ]);

    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim();
      const hint = detail.includes("auth") || detail.includes("401")
        ? " Run `gh auth login` and try again."
        : detail.includes("release not found") || detail.includes("Not Found")
          ? config.repoEnvHint
            ? ` ${config.repoEnvHint}`
            : ` No releases found for ${config.repo}.`
          : "";
      throw new Error(
        `Failed to fetch latest release from ${config.repo}: ${detail || "unknown error"}.${hint}`,
      );
    }

    let parsed: { tagName?: string };
    try {
      parsed = JSON.parse(result.stdout) as { tagName?: string };
    } catch {
      throw new Error("Failed to parse release metadata from gh");
    }

    if (!parsed.tagName) {
      throw new Error("No release tag found for this repository");
    }

    return parseReleaseTag(parsed.tagName);
  };
}

function ensureGhAvailable(): void {
  if (Bun.which("gh") === null) {
    throw new Error(
      "GitHub CLI (gh) is required. Install from https://cli.github.com/ and run `gh auth login`.",
    );
  }
}

async function downloadReleaseAsset(config: GhReleaseUpdateConfig, tempDir: string): Promise<string> {
  const result = await runGh([
    "release",
    "download",
    "--repo",
    config.repo,
    "--pattern",
    config.asset,
    "--dir",
    tempDir,
  ]);

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      `Failed to download release from ${config.repo}: ${detail || "unknown error"}`,
    );
  }

  const downloadedPath = join(tempDir, config.asset);
  if (!existsSync(downloadedPath)) {
    throw new Error(`Release asset "${config.asset}" was not found in the download`);
  }

  return downloadedPath;
}

async function runGh(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function readVersionCheckCache(cachePath: string): VersionCheckCache | null {
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as VersionCheckCache;
    if (typeof parsed.fetchedAt !== "number" || typeof parsed.latest !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeVersionCheckCache(cachePath: string, cache: VersionCheckCache): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache));
}
