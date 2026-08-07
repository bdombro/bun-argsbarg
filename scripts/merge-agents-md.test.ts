/*
Tests for merge-agents-md.ts — consumer AGENTS.md merge behavior.
*/

import { describe, expect, test } from "bun:test";
import {
  extractConventionSuffix,
  extractManagedBlock,
  extractPrefix,
  mergeAgentsMd,
  stripManagedPlaceholders,
} from "./merge-agents-md.ts";

const TEMPLATE = `# full-example-json

## Tooling

- Bun only.

<!-- argsbarg:managed -->
## Argsbarg schema

Managed content here.

## Code conventions

More managed content.

<!-- /argsbarg:managed -->

**full-example-json conventions:**

Replace with app-specific bullets.
`;

describe("merge-agents-md", () => {
  test("extractManagedBlock returns region between markers", () => {
    const block = extractManagedBlock(TEMPLATE);
    expect(block).toContain("<!-- argsbarg:managed -->");
    expect(block).toContain("Managed content here.");
    expect(block).toContain("<!-- /argsbarg:managed -->");
    expect(block).not.toContain("## Tooling");
  });

  test("extractPrefix returns content before managed region without title", () => {
    const existing = `# myapp

## Custom section

App-specific notes.

<!-- argsbarg:managed -->
old managed
<!-- /argsbarg:managed -->

**myapp conventions:**

- keep me
`;
    expect(extractPrefix(existing)).toBe("## Custom section\n\nApp-specific notes.");
  });

  test("extractConventionSuffix preserves real conventions block", () => {
    const existing = `${TEMPLATE}

**sqsp-qa conventions:**

- Shared flags in cli/shared.ts
`;
    const suffix = extractConventionSuffix(existing);
    expect(suffix).toContain("**sqsp-qa conventions:**");
    expect(suffix).toContain("Shared flags");
    expect(suffix).not.toContain("Replace with app-specific");
  });

  test("extractConventionSuffix skips placeholder conventions", () => {
    expect(extractConventionSuffix(TEMPLATE)).toBe("");
  });

  test("stripManagedPlaceholders removes placeholder convention lines", () => {
    const managed = extractManagedBlock(TEMPLATE);
    const stripped = stripManagedPlaceholders(managed);
    expect(stripped).not.toContain("Replace with app-specific");
    expect(stripped).not.toContain("**full-example-json conventions:**");
  });

  test("mergeAgentsMd preserves prefix and suffix, replaces managed block", () => {
    const existing = `# sqsp-qa

## Ink

Ink patterns.

<!-- argsbarg:managed -->
## Argsbarg schema

Stale managed.

<!-- /argsbarg:managed -->

**sqsp-qa conventions:**

- readQaMutatingFlags
`;
    const merged = mergeAgentsMd(TEMPLATE, existing, "sqsp-qa");
    expect(merged).toContain("## Ink");
    expect(merged).toContain("Ink patterns.");
    expect(merged).toContain("Managed content here.");
    expect(merged).not.toContain("Stale managed.");
    expect(merged).toContain("**sqsp-qa conventions:**");
    expect(merged).toContain("readQaMutatingFlags");
    expect(merged).not.toContain("Replace with app-specific");
  });

  test("mergeAgentsMd writes fresh file when no existing content", () => {
    const merged = mergeAgentsMd(TEMPLATE, undefined, "newapp");
    expect(merged.startsWith("# newapp\n")).toBe(true);
    expect(merged).toContain("Managed content here.");
    expect(merged).not.toContain("**newapp conventions:**");
  });
});
