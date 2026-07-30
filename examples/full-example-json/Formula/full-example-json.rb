class FullExampleJson < Formula
  desc "Argsbarg schema-first copy template (@sg schemagen, JSON schemas, REST CRUD)"
  homepage "https://github.com/bdombro/bun-argsbarg"
  version "1.0.0"
  sha256 "d6dbe3233152d2f51feca068b23e6fd133940232fb4bb7c3f08c2d1024c10c30"

  def install
    bin.install "full-example-json"
    chmod 0755, bin/"full-example-json"
    generate_completions_from_executable(bin/"full-example-json", "completion", base_name: "full-example-json")
  end

  def post_install
    system bin/"full-example-json", "configure", "--sync", "--yes"
  end

  def uninstall
    system bin/"full-example-json", "configure", "--remove-all", "--yes"
  end

  def caveats
    <<~EOS
      Run `full-example-json configure` to set up agent artifacts and app config (interactive).
      Restart MCP chat apps (Cursor, Claude Desktop, etc.) after install or upgrade so they load the updated server.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/full-example-json version")
    assert_predicate bash_completion/"full-example-json", :exist?
    assert_predicate zsh_completion/"_full-example-json", :exist?
    assert_predicate fish_completion/"full-example-json.fish", :exist?
  end
url "file:///Users/briandombrowski/dev/bdombro/bun-argsbarg/examples/full-example-json/Formula/.staging/full-example-json"
end
