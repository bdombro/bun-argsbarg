import { existsSync } from "node:fs";
import type { CliProgram } from "../types.ts";
import { runInstallMutation } from "./index.ts";
import { installErr } from "./status.ts";

/** Downloads the latest release and reinstalls installed artifacts (`myapp install --update`). */
export async function cliUpdate(root: CliProgram): Promise<never> {
  const hook = root.install?.updateGetLatest;
  if (!hook) {
    installErr("update is not configured. Set install.updateGetLatest on the program root.");
    process.exit(1);
  }

  let artifact: Awaited<ReturnType<typeof hook>>;
  try {
    artifact = await hook({ version: root.version });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    installErr(message);
    process.exit(1);
  }

  if (!artifact.path || !existsSync(artifact.path)) {
    installErr(`updateGetLatest returned missing binary: ${JSON.stringify(artifact.path)}`);
    process.exit(1);
  }

  if (artifact.version !== undefined && artifact.version === root.version) {
    process.stdout.write(`Already at v${root.version}\n`);
    await artifact.cleanup?.();
    process.exit(0);
  }

  const currentVersion = root.version;
  try {
    await runInstallMutation(root, {
      reinstall: "1",
      yes: "1",
      quiet: "1",
      from: artifact.path,
    });
  } catch (err) {
    await artifact.cleanup?.();
    installErr(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  await artifact.cleanup?.();

  if (artifact.version !== undefined && artifact.version !== currentVersion) {
    process.stdout.write(`Updated ${root.key} ${currentVersion} → ${artifact.version}\n`);
  }

  process.exit(0);
}
