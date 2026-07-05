#!/usr/bin/env bun
/** Generate Formula/full-example.rb for local dev install (file:// URL). Prefer `with-dev-formula.ts` via `just install-local`. */

import { releaseFormulaPath, writeDevFormula } from "./dev-formula.ts";

writeDevFormula();
console.log(`Wrote ${releaseFormulaPath()}`);
