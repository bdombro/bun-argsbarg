/** CLI identity — substituted by `argsbarg create`. */

export const createIdentity = {
  key: "example-api",
  className: "ExampleApi",
  tap: "bdombro/bun-argsbarg",
  homepage: "https://github.com/bdombro/bun-argsbarg",
  releaseRepo: "bdombro/bun-argsbarg",
  desc: "Argsbarg schema-first copy template (Zod schemas, typed leaves, REST CRUD)",
  envPrefix: "EXAMPLE_API",
  template: "api",
} as const;
