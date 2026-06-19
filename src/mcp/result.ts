/*
This module builds MCP tools/call success results from captured handler output.
*/

/** Text content block in an MCP tool result. */
export interface McpTextContent {
  type: "text";
  text: string;
}

/** Successful MCP tools/call result payload. */
export interface McpToolCallSuccess {
  content: McpTextContent[];
  structuredContent?: unknown;
  isError: false;
}

/** Parses stdout as JSON when the full trimmed string is valid JSON. */
function parseStructuredStdout(stdout: string): unknown | undefined {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Builds a successful tools/call result from captured handler stdout/stderr.
 * stderr is a second content block when non-empty; structuredContent is set when stdout is JSON.
 */
export function buildToolCallSuccess(stdout: string, stderr: string): McpToolCallSuccess {
  const content: McpTextContent[] = [];
  if (stdout.length > 0) {
    content.push({ type: "text", text: stdout });
  }
  const errText = stderr.trim();
  if (errText.length > 0) {
    if (content.length === 0) {
      content.push({ type: "text", text: "" });
    }
    content.push({ type: "text", text: errText });
  }
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  const structuredContent = parseStructuredStdout(stdout);
  const result: McpToolCallSuccess = { content, isError: false };
  if (structuredContent !== undefined) {
    result.structuredContent = structuredContent;
  }
  return result;
}
