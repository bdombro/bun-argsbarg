# Node Distribution

The default plugin ships TypeScript and starts with Bun. To ship a standalone
Node MCP server instead, follow the bundle-based distribution described below.
Bun remains the development/build tool; plugin users need Node but do not need
Bun, dependency installation, or schema generation at startup.
 Note: bundle distrobutions mean committing large bundled js files to the repo.
## 1. Build The Bundle

Add this recipe to `justfile`:

```just
# Generate schemas and bundle the standalone Node MCP server
build: schemagen
    bun build ./src/index.ts --target=node --outfile=./scripts/mcp.mjs
```

Run `just setup` and `just build` from the project root. Schemas must exist before
bundling so their static imports are included in the output.

Keep the MCP runtime compatible with Node. Bundling does not implement Bun-only
APIs such as `Bun.serve` or `bun:sqlite`; port or exclude any such runtime paths.
The HTTP server capability is separate from this Node MCP distribution.

## 2. Change Startup

Remove `prestart` from `package.json` and change `start` to:

```json
"start": "node scripts/mcp.mjs mcp"
```

Declare the supported Node version range under `engines.node` and document it in
the README. Bun is still needed by maintainers for schema generation, tests, and
bundling. The Bun shell settings in `bunfig.toml` can remain for development.

## 3. Update Inline Plugin Configs

Keep MCP configuration inside the plugin manifests; do not reintroduce separate
root MCP config files. Replace the `mcpServers` field in
`.claude-plugin/plugin.json` with:

```json
"mcpServers": {
  "mcp-plugin": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/mcp.mjs", "mcp"]
  }
}
```

Use the corresponding field in `.cursor-plugin/plugin.json`:

```json
"mcpServers": {
  "mcp-plugin": {
    "command": "node",
    "args": ["${CURSOR_PLUGIN_ROOT}/scripts/mcp.mjs", "mcp"]
  }
}
```

Launching Node directly avoids relying on a package manager on the user's
machine. Keep each path as one argument so plugin roots containing spaces work.

## 4. Package And Release

- Add `build` as a dependency of `plugin-cursor-upsert` and
  `plugin-claude-install` so local installs have a fresh bundle.
- Restore `just build` in `scripts/release.ts` after version/documentation
  updates and before committing or publishing. Fail the release if it fails.
- Include `scripts/mcp.mjs` in the released plugin. For repository-based
  installation, commit the generated bundle so a fresh clone is runnable.
- Do not ship `node_modules` or generated schemas separately. Their runtime
  contents should be bundled; inspect external imports and package any required
  runtime assets explicitly.
- Update the README and the project-specific tooling section of `AGENTS.md`
  to describe Node as the plugin runtime and Bun as the development tool.

## 5. Verify The Node Distribution

After building, a basic stdio check is:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  | node scripts/mcp.mjs mcp
```

Only JSON-RPC responses should appear on stdout. Exercise `tools/list` and a
representative tool call as well: successful initialization alone does not prove
that every command's runtime dependencies are Node-compatible.

Check both manifest commands from an unrelated working directory with the
plugin-root placeholders expanded to the installed path. Verify a clean copy
with no `node_modules` or generated schemas, using the declared minimum Node
version and a current supported Node version. Keep transport/package checks at
the integration level; agent E2E should measure real user-task outcomes.