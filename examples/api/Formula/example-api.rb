class ExampleApi < Formula
  desc "Argsbarg schema-first copy template (Zod schemas, typed leaves, REST CRUD)"
  homepage "https://github.com/bdombro/bun-argsbarg"
  version "1.0.0"
  sha256 "d6dbe3233152d2f51feca068b23e6fd133940232fb4bb7c3f08c2d1024c10c30"

  def install
    bin.install "example-api"
    chmod 0755, bin/"example-api"
    generate_completions_from_executable(bin/"example-api", "completion", base_name: "example-api")
  end

  def caveats
    <<~EOS
      After install or upgrade:
        example-api configure install

      Before uninstall:
        example-api configure uninstall
        brew uninstall <tap>/example-api

      Restart MCP chat apps (Cursor, Claude Desktop, etc.) after install or upgrade so they load the updated server.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/example-api version")
    assert_predicate bash_completion/"example-api", :exist?
    assert_predicate zsh_completion/"_example-api", :exist?
    assert_predicate fish_completion/"example-api.fish", :exist?
  end
url "file:///Users/briandombrowski/dev/bdombro/bun-argsbarg/examples/api/Formula/.staging/example-api"
end
