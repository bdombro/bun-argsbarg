/** Shared Ruby fragments embedded in Homebrew formulae. */

import { createIdentity } from "./create-identity.ts";

const { key, className, desc, homepage, releaseRepo } = createIdentity;

export const formulaInstallRuby = `def install
    bin.install "${key}"
    chmod 0755, bin/"${key}"
    generate_completions_from_executable(bin/"${key}", "completion", base_name: "${key}")
  end`;

export const formulaPostInstallRuby = `def post_install
    system bin/"${key}", "configure", "--sync", "--yes"
  end`;

export const formulaUninstallRuby = `def uninstall
    system bin/"${key}", "configure", "--remove-config", "--yes"
  end`;

export const formulaCaveatsRuby = `def caveats
    <<~EOS
      Run \`${key} configure\` to set up agent artifacts and app config (interactive).
      Restart MCP chat apps (Cursor, Claude Desktop, etc.) after install or upgrade so they load the updated server.
    EOS
  end`;

export const formulaTestRuby = `test do
    assert_match version.to_s, shell_output("#{bin}/${key} version")
    assert_predicate bash_completion/"${key}", :exist?
    assert_predicate zsh_completion/"_${key}", :exist?
    assert_predicate fish_completion/"${key}.fish", :exist?
  end`;

export interface FormulaCoords {
  url: string;
  urlStanza: string;
  version: string;
  sha256: string;
  /** When true, embed {@link githubPrivateReleaseDownloadStrategyRuby} in the formula class. */
  privateRelease?: boolean;
}

/** Resolves private GitHub release assets via the API at download time. */
export const githubPrivateReleaseDownloadStrategyRuby = `  class GitHubPrivateReleaseDownloadStrategy < CurlDownloadStrategy
    def initialize(url, name, version, **meta)
      super
      pattern = %r{https://github\\.com/([^/]+)/([^/]+)/releases/download/([^/]+)/(\\S+)}
      match = url.match(pattern)
      raise CurlDownloadStrategyError, "Invalid GitHub release URL: #{url}" unless match
      @owner, @repo, @tag, @filename = match.captures
    end

    def _fetch(url:, resolved_url: resolved_download_url, timeout:)
      curl_download resolved_download_url,
                    "--header", "Accept: application/octet-stream",
                    "--header", "Authorization: Bearer #{GitHub::API.credentials}",
                    to: temporary_path
    end

    private

    def resolved_download_url
      @resolved_download_url ||= begin
        asset = GitHub.get_release(@owner, @repo, @tag).fetch("assets")
          .find { |a| a["name"] == @filename }
        raise CurlDownloadStrategyError, "Release asset not found: #{@filename}" unless asset
        asset.fetch("url")
      end
    end
  end`;

/** Homebrew `url` for local dev staging paths. */
export function devUrlStanza(url: string): string {
  return `url "${url}"`;
}

/** Homebrew `url` for GitHub release assets (uses {@link githubPrivateReleaseDownloadStrategyRuby}). */
export function releaseUrlStanza(url: string): string {
  return `url "${url}",
      using: GitHubPrivateReleaseDownloadStrategy`;
}

export function releaseFormulaUrl(version: string): string {
  return `https://github.com/${releaseRepo}/releases/download/v${version}/${key}`;
}

export function renderFormula(coords: FormulaCoords): string {
  const strategyBlock = coords.privateRelease ? `\n${githubPrivateReleaseDownloadStrategyRuby}\n\n  ` : "";
  return `class ${className} < Formula
  desc "${desc}"
  homepage "${homepage}"
  version "${coords.version}"
  sha256 "${coords.sha256}"

  ${formulaInstallRuby}

  ${formulaPostInstallRuby}

  ${formulaUninstallRuby}

  ${formulaCaveatsRuby}

  ${formulaTestRuby}
${strategyBlock}${coords.urlStanza}
end
`;
}

export function renderReleaseFormula(version: string, sha256: string): string {
  const url = releaseFormulaUrl(version);
  return renderFormula({
    url,
    urlStanza: releaseUrlStanza(url),
    version,
    sha256,
    privateRelease: true,
  });
}

export function renderDevFormula(stagingPath: string, version: string, sha256: string): string {
  const url = `file://${stagingPath}`;
  return renderFormula({
    url,
    urlStanza: devUrlStanza(url),
    version,
    sha256,
  });
}
