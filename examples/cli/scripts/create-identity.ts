/** CLI identity — substituted by `argsbarg create`. */

export const createIdentity = {
  key: "example-cli",
  className: "ExampleCli",
  tap: "bdombro/bun-argsbarg",
  homepage: "https://github.com/bdombro/bun-argsbarg",
  releaseRepo: "bdombro/bun-argsbarg",
  desc: "Argsbarg CLI copy template (MCP, HTTP, configure, skills; options and flags only)",
  envPrefix: "EXAMPLE_CLI",
  template: "cli",
} as const;
