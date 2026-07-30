import type { InstallTarget } from "../target-base.ts";
import { agentsMcpTarget } from "./agents-mcp.ts";
import { appTarget } from "./app.ts";
import { configureTarget } from "./configure.ts";
import { skillTarget } from "./skill.ts";

/** Ordered install targets (plan iteration order). */
export const INSTALL_TARGETS: InstallTarget[] = [appTarget, skillTarget, agentsMcpTarget, configureTarget];

export { agentsMcpTarget, appTarget, configureTarget, skillTarget };
