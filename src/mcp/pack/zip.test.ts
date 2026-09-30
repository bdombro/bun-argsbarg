/*
Tests for mcp/zip module behavior.
*/

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { zipStore } from "./zip.ts";

test("zipStore preserves unix executable mode on extract", () => {
  const work = mkdtempSync(join(tmpdir(), "zip-exec-"));
  const data = Buffer.from("#!/bin/sh\necho hi\n");
  const zip = zipStore([{ name: "bin/tool", data, unixMode: 0o100755 }]);
  writeFileSync(join(work, "plugin.zip"), zip);
  execSync("unzip -o -q plugin.zip", { cwd: work });
  const mode = statSync(join(work, "bin", "tool")).mode & 0o777;
  assert.notEqual(mode & 0o111, 0);
  assert.equal(readFileSync(join(work, "bin", "tool"), "utf8"), "#!/bin/sh\necho hi\n");
});
