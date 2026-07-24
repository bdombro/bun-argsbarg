/*
Headless routing helpers (`argsbarg/headless`).
*/

export type { HeadlessContext } from "../headless/routing.ts";
export {
  formatDryRunMessage,
  requireYesInNonTty,
  shouldRunHeadless,
  shouldRunHeadlessWithPositionals,
  shouldRunHeadlessWithYes,
  wantsExplicitJson,
} from "../headless/routing.ts";
