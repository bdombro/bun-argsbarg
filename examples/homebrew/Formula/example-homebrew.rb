class ExampleHomebrew < Formula
  desc "Argsbarg Homebrew CLI template (Bun-compiled binary, formula, tap)"
  homepage "https://github.com/bdombro/bun-argsbarg"
  version "1.0.0"
  sha256 "d6dbe3233152d2f51feca068b23e6fd133940232fb4bb7c3f08c2d1024c10c30"

  def install
    bin.install "example-homebrew"
    chmod 0755, bin/"example-homebrew"
    generate_completions_from_executable(bin/"example-homebrew", "completion", base_name: "example-homebrew")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/example-homebrew version")
    assert_predicate bash_completion/"example-homebrew", :exist?
    assert_predicate zsh_completion/"_example-homebrew", :exist?
    assert_predicate fish_completion/"example-homebrew.fish", :exist?
  end
end
