/** Run argsbarg schemagen in the current working directory (or `--root`). */

import { resolve } from "node:path";
import { runSchemagen } from "./schemagen/run.ts";

export interface RunSchemagenCliOptions {
  root?: string;
  srcDir?: string;
  tsconfig?: string;
}

/** Exit 0 on success; throws on failure. */
export function runSchemagenCli(options: RunSchemagenCliOptions = {}): void {
  const projectRoot = resolve(options.root ?? process.cwd());
  const counts = runSchemagen({
    projectRoot,
    srcDir: options.srcDir,
    tsconfig: options.tsconfig,
  });
  console.log(
    `config roots: ${counts.configRoots}, input roots: ${counts.inputRoots}, output roots: ${counts.outputRoots}`,
  );
}
