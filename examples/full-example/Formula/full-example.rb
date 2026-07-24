class FullExample < Formula
  desc "Argsbarg full example reference app"
  homepage "https://github.com/bdombro/bun-argsbarg"
  version "1.0.0"
  sha256 "d6dbe3233152d2f51feca068b23e6fd133940232fb4bb7c3f08c2d1024c10c30"

  def install
    bin.install "full-example"
    chmod 0755, bin/"full-example"
    generate_completions_from_executable(bin/"full-example", "completion", base_name: "full-example")
  end

  def post_install
    system bin/"full-example", "configure", "--sync", "--yes"
  end

  def uninstall
    system bin/"full-example", "configure", "--remove-all", "--yes"
  end

  def caveats
    <<~EOS
      Run `full-example configure` to set up agent artifacts and app config (interactive).
      Restart MCP chat apps (Cursor, Claude Desktop, etc.) after install or upgrade so they load the updated server.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/full-example version")
    assert_predicate bash_completion/"full-example", :exist?
    assert_predicate zsh_completion/"_full-example", :exist?
    assert_predicate fish_completion/"full-example.fish", :exist?
  end
url "file:///Users/briandombrowski/dev/bdombro/bun-argsbarg/examples/full-example/Formula/.staging/full-example"
end
