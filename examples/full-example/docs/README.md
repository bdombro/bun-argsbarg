# full-example documentation

Reference template for argsbarg consumer docgen. Every builtin is enabled in `src/program.ts`.

| If you are… | Read |
| --- | --- |
| **Using the CLI** | [../README.md](../README.md) |
| **Authoring argsbarg schema** | `node_modules/argsbarg/docs/cli-program.md` — see `.cursor/rules/cli-program.mdc` |
| **HTTP API / curl** | [http.md](http.md) — generated; or run `full-example docs http` |
| **MCP tools** | [mcp.md](mcp.md) — generated; or run `full-example docs mcp` |
| **Full command tree (markdown)** | [api.md](api.md) — generated |
| **Full command tree (JSON)** | [cli-schema.json](cli-schema.json) — generated |
| **OpenAPI 3.1** | [openapi.json](openapi.json) — generated |
| **Agent skill index** | [skill.md](skill.md) — generated |

## Framework docs vs this directory

| Layer | Contents |
| --- | --- |
| **Argsbarg framework** | How to author `CliProgram`, MCP, HTTP API | `node_modules/argsbarg/docs/` |
| **This `docs/` folder** | *full-example* command tree and guides | `just docgen` |

Do not hand-edit generated files. Refresh with:

```bash
just docgen
```
