/* Unit tests for shared headless error text (MCP and HTTP). */

import { describe, expect, test } from "bun:test";
import { type HeadlessToolCallFailure, headlessFailureMcpMessage, headlessFailureToHttpResponse } from "./tool-call.ts";

/** Builds a failed headless result with the given error message. */
function invokeFailure(
  /** Full error text from the leaf. */
  message: string,
): HeadlessToolCallFailure {
  return {
    exitCode: 1,
    kind: "invoke",
    message,
    ok: false,
    stderr: "",
    stdout: "",
  };
}

describe("headless error text", () => {
  const multiline =
    'cannot copy tab "Spec" losslessly (1 smart chip(s): "Ada"). Use force: true.\n' +
    '  • node h.x: contains 1 smart chip(s) ("Ada")\n\n' +
    "Google Docs REST API has no native tab duplication endpoint.";

  test("MCP and HTTP both keep the full multi-line error", async () => {
    expect(headlessFailureMcpMessage(invokeFailure(multiline))).toBe(multiline);
    const body = (await headlessFailureToHttpResponse(invokeFailure(multiline)).json()) as { error: string };
    expect(body.error).toBe(multiline);
  });
});
