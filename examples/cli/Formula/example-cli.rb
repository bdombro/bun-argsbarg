class ExampleCli < Formula
  desc "Argsbarg full example reference app"
  homepage "https://github.com/bdombro/bun-argsbarg"
  version "1.0.0"
  sha256 "d6dbe3233152d2f51feca068b23e6fd133940232fb4bb7c3f08c2d1024c10c30"

  def install
    bin.install "example-cli"
    chmod 0755, bin/"example-cli"
    generate_completions_from_executable(bin/"example-cli", "completion", base_name: "example-cli")
  end

  def caveats
    <<~EOS
      After install or upgrade:
        example-cli configure install

      Before uninstall:
        example-cli configure uninstall
        brew uninstall <tap>/example-cli

      Restart MCP chat apps (Cursor, Claude Desktop, etc.) after install or upgrade so they load the updated server.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/example-cli version")
    assert_predicate bash_completion/"example-cli", :exist?
    assert_predicate zsh_completion/"_example-cli", :exist?
    assert_predicate fish_completion/"example-cli.fish", :exist?
  end
url "file:///Users/briandombrowski/dev/bdombro/bun-argsbarg/examples/cli/Formula/.staging/example-cli"
end
