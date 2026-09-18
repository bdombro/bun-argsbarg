/*
Tests for merge-agents-md.ts — consumer AGENTS.md merge behavior.
*/

import { describe, expect, test } from "bun:test";
import {
  extractAppContent,
  extractConventionSuffix,
  extractManagedBlock,
  extractPrefix,
  mergeAgentsMd,
  stripManagedPlaceholders,
} from "./merge-agents-md.ts";

const TEMPLATE = `# full-example-json

<!-- argsbarg:managed — overwritten on merge; framework baseline; app-specific sections below take precedence -->

> **Baseline framework rules:** The conventions below are defaults for argsbarg projects. Project-specific sections below this managed block override these defaults.

## Argsbarg schema

Managed content here.

## Code conventions

More managed content.

<!-- /argsbarg:managed -->

## Tooling

- Bun only.

## App conventions

Replace with app-specific bullets.
`;

describe("merge-agents-md", () => {
  test("extractManagedBlock returns region between markers", () => {
    const block = extractManagedBlock(TEMPLATE);
    expect(block).toContain("<!-- argsbarg:managed");
    expect(block).toContain("overwritten on merge");
    expect(block).toContain("Managed content here.");
    expect(block).toContain("<!-- /argsbarg:managed -->");
    expect(block).not.toContain("## Tooling");
  });

  test("extractManagedBlock accepts the short <!-- argsbarg:managed --> form", () => {
    const block = extractManagedBlock(`# app
<!-- argsbarg:managed -->
legacy
<!-- /argsbarg:managed -->
`);
    expect(block).toContain("<!-- argsbarg:managed -->");
    expect(block).toContain("legacy");
    expect(block).toContain("<!-- /argsbarg:managed -->");
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

  test("extractAppContent preserves all app content below managed block in modern layout", () => {
    const modern = `# sqsp-qa

<!-- argsbarg:managed -->
managed
<!-- /argsbarg:managed -->

## Tooling

- Bun only.

## App conventions

- My custom convention
`;
    const appContent = extractAppContent(modern);
    expect(appContent).toContain("## Tooling");
    expect(appContent).toContain("- Bun only.");
    expect(appContent).toContain("## App conventions");
    expect(appContent).toContain("- My custom convention");
    expect(appContent).not.toContain("managed");
  });

  test("extractAppContent migrates legacy layout by combining prefix and suffix below managed block", () => {
    const legacy = `# sqsp-qa

## Tooling

- Bun only.

<!-- argsbarg:managed -->
old managed
<!-- /argsbarg:managed -->

**sqsp-qa conventions:**

- Custom rule 1
`;
    const appContent = extractAppContent(legacy);
    expect(appContent).toContain("## Tooling");
    expect(appContent).toContain("**sqsp-qa conventions:**");
    expect(appContent).not.toContain("old managed");
  });

  test("stripManagedPlaceholders removes placeholder convention lines", () => {
    const managed = extractManagedBlock(TEMPLATE);
    const stripped = stripManagedPlaceholders(managed);
    expect(stripped).not.toContain("Replace with app-specific");
    expect(stripped).not.toContain("**full-example-json conventions:**");
  });

  test("mergeAgentsMd places managed block at top and app sections below", () => {
    const modern = `# sqsp-qa

<!-- argsbarg:managed -->
Old managed.
<!-- /argsbarg:managed -->

## Tooling

- Bun only.

## App conventions

- readQaMutatingFlags
`;
    const merged = mergeAgentsMd(TEMPLATE, modern, "sqsp-qa");
    expect(merged.startsWith("# sqsp-qa\n")).toBe(true);

    const managedIdx = merged.indexOf("Managed content here.");
    const toolingIdx = merged.indexOf("## Tooling");
    const conventionsIdx = merged.indexOf("readQaMutatingFlags");

    expect(managedIdx).toBeGreaterThan(0);
    expect(toolingIdx).toBeGreaterThan(managedIdx);
    expect(conventionsIdx).toBeGreaterThan(toolingIdx);
    expect(merged).not.toContain("Old managed.");
  });

  test("mergeAgentsMd migrates legacy layout so app sections live below managed block", () => {
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

    const managedIdx = merged.indexOf("Managed content here.");
    const inkIdx = merged.indexOf("## Ink");
    expect(inkIdx).toBeGreaterThan(managedIdx);
  });

  test("mergeAgentsMd writes fresh file with managed block followed by starter app sections", () => {
    const merged = mergeAgentsMd(TEMPLATE, undefined, "newapp");
    expect(merged.startsWith("# newapp\n")).toBe(true);
    expect(merged).toContain("Managed content here.");
    expect(merged).toContain("## Tooling");
    expect(merged).toContain("## App conventions");

    const managedIdx = merged.indexOf("Managed content here.");
    const toolingIdx = merged.indexOf("## Tooling");
    expect(toolingIdx).toBeGreaterThan(managedIdx);
  });
});
