/*
This module invokes leaf CLI handlers without exiting the process.
It parses argv against the user schema, captures stdout/stderr, and patches
process.exit so MCP tool calls can run handlers repeatedly.
*/

import { CliContext } from "./context.ts";
import { builtinInterceptRoot } from "./builtins/dispatch.ts";
import { cliPresentationRoot } from "./builtins/presentation.ts";
import { parse, postParseValidate, ParseKind } from "./parse.ts";
import { type CliNode, type CliProgram, isCliLeaf, isCliRouter } from "./types.ts";
import { format } from "node:util";

/** Outcome of a non-exiting CLI invocation. */
export type CliInvokeKind = "ok" | "help" | "error";

/** Result of cliInvoke: captured output and exit metadata without process.exit. */
export interface CliInvokeResult {
  /** Invocation outcome. */
  kind: CliInvokeKind;
  /** Simulated exit code. */
  exitCode: number;
  /** Captured stdout during handler execution. */
  stdout: string;
  /** Captured stderr during handler execution. */
  stderr: string;
  /** Set when kind === "error" (parse/validation message). */
  errorMsg?: string;
}

/** Thrown internally when a patched process.exit fires during handler execution. */
class CliInvokeExit extends Error {
  /** Exit code passed to process.exit. */
  readonly code: number;

  /** Creates an exit signal with the given status code. */
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = "CliInvokeExit";
    this.code = code;
  }
}

/** Looks up a subcommand or routing node by `key`. */
function findChild(cmds: CliNode[], name: string): CliNode | undefined {
  return cmds.find((c) => c.key === name);
}

/**
 * Parses argv against the user root, runs the leaf handler, and returns captured output.
 * Never calls process.exit.
 */
export async function cliInvoke(root: CliProgram, argv: string[]): Promise<CliInvokeResult> {
  let parseRoot: CliNode = root;
  if (isCliLeaf(root)) {
    const intercept = builtinInterceptRoot(root, argv);
    if (intercept.parseRoot !== root) {
      parseRoot = intercept.parseRoot;
    }
  } else {
    parseRoot = cliPresentationRoot(root);
  }

  let pr = parse(parseRoot, argv);
  pr = postParseValidate(parseRoot, pr);

  if (pr.kind === ParseKind.Help) {
    return {
      kind: "help",
      exitCode: 1,
      stdout: "",
      stderr: "",
      errorMsg: "Help is not available via MCP tool calls.",
    };
  }

  if (pr.kind === ParseKind.Error) {
    return {
      kind: "error",
      exitCode: 1,
      stdout: "",
      stderr: pr.errorMsg,
      errorMsg: pr.errorMsg,
    };
  }

  let current: CliNode = parseRoot;
  for (const seg of pr.path) {
    if (!isCliRouter(current)) {
      return {
        kind: "error",
        exitCode: 1,
        stdout: "",
        stderr: "Internal error: missing handler for path.",
        errorMsg: "Internal error: missing handler for path.",
      };
    }
    const ch = findChild(current.commands, seg);
    if (!ch) {
      return {
        kind: "error",
        exitCode: 1,
        stdout: "",
        stderr: "Internal error: missing handler for path.",
        errorMsg: "Internal error: missing handler for path.",
      };
    }
    current = ch;
  }

  if (!("handler" in current) || !current.handler) {
    return {
      kind: "error",
      exitCode: 1,
      stdout: "",
      stderr: "Internal error: missing handler for path.",
      errorMsg: "Internal error: missing handler for path.",
    };
  }

  const handler = current.handler;
  const ctx = new CliContext(root.key, pr.path, pr.args, pr.opts, root, "mcp");

  let stdout = "";
  let stderr = "";
  const origExit = process.exit;
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origConsoleLog = console.log;
  const origConsoleError = console.error;
  const origConsoleInfo = console.info;
  const origConsoleWarn = console.warn;

  process.exit = ((code?: number) => {
    throw new CliInvokeExit(code ?? 0);
  }) as typeof process.exit;

  process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    stdout += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    if (typeof args[0] === "function") {
      (args[0] as () => void)();
    }
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    stderr += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    if (typeof args[0] === "function") {
      (args[0] as () => void)();
    }
    return true;
  }) as typeof process.stderr.write;

  console.log = (...args: unknown[]) => {
    stdout += format(...args) + "\n";
  };
  console.info = (...args: unknown[]) => {
    stdout += format(...args) + "\n";
  };
  console.warn = (...args: unknown[]) => {
    stderr += format(...args) + "\n";
  };
  console.error = (...args: unknown[]) => {
    stderr += format(...args) + "\n";
  };

  try {
    await Promise.resolve(handler(ctx));
    return { kind: "ok", exitCode: 0, stdout, stderr };
  } catch (err) {
    if (err instanceof CliInvokeExit) {
      if (err.code === 0) {
        return { kind: "ok", exitCode: 0, stdout, stderr };
      }
      const msg = stderr.trim() || `Exit code ${err.code}`;
      return { kind: "error", exitCode: err.code, stdout, stderr, errorMsg: msg };
    }
    if (err instanceof Error) {
      return {
        kind: "error",
        exitCode: 1,
        stdout,
        stderr: err.message + "\n",
        errorMsg: err.message,
      };
    }
    return {
      kind: "error",
      exitCode: 1,
      stdout,
      stderr: "Unknown error\n",
      errorMsg: "Unknown error",
    };
  } finally {
    process.exit = origExit;
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    console.log = origConsoleLog;
    console.error = origConsoleError;
    console.info = origConsoleInfo;
    console.warn = origConsoleWarn;
  }
}
