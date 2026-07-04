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

export const formulaCaveatsRuby = `def caveats
    <<~EOS
      Run \`${key} configure\` to set up agent artifacts and app config (interactive).
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
  version: string;
  sha256: string;
}

export function releaseFormulaUrl(version: string): string {
  return `https://github.com/${releaseRepo}/releases/download/v${version}/${key}`;
}

export function renderFormula(coords: FormulaCoords): string {
  return `class ${className} < Formula
  desc "${desc}"
  homepage "${homepage}"
  url "${coords.url}"
  version "${coords.version}"
  sha256 "${coords.sha256}"
{dependsOnBlock}
  ${formulaInstallRuby}

  ${formulaPostInstallRuby}

  ${formulaCaveatsRuby}

  ${formulaTestRuby}
end
`;
}

export function renderReleaseFormula(version: string, sha256: string): string {
  return renderFormula({
    url: releaseFormulaUrl(version),
    version,
    sha256,
  });
}

export function renderDevFormula(stagingPath: string, version: string, sha256: string): string {
  return renderFormula({
    url: `file://${stagingPath}`,
    version,
    sha256,
  });
}
