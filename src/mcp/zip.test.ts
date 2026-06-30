import { expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipStore } from "./zip.ts";

test("zipStore preserves unix executable mode on extract", () => {
  const work = mkdtempSync(join(tmpdir(), "zip-exec-"));
  const data = Buffer.from("#!/bin/sh\necho hi\n");
  const zip = zipStore([{ name: "bin/tool", data, unixMode: 0o100755 }]);
  writeFileSync(join(work, "plugin.zip"), zip);
  execSync("unzip -o -q plugin.zip", { cwd: work });
  const mode = statSync(join(work, "bin", "tool")).mode & 0o777;
  expect(mode & 0o111).not.toBe(0);
  expect(readFileSync(join(work, "bin", "tool"), "utf8")).toBe("#!/bin/sh\necho hi\n");
});
