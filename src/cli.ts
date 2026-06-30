/*
Runtime entry point: validate program, cache derived state, run / invoke / MCP serve.
*/

import { format } from "node:util";
import { builtinInterceptRoot, dispatchBuiltin } from "./builtins/dispatch.ts";
import { cliParseRoot, cliPresentationRoot } from "./builtins/presentation.ts";
import {
  assertBuiltinAllowed,
  type CliCapabilities,
  resolveCapabilities,
  skipsRequiredAppConfigExit,
} from "./capabilities.ts";
import {
  bootstrapAppConfig,
  type EnsureAppConfigOpts,
  ensureAppConfig,
} from "./config/bootstrap.ts";
import { type AnyAppConfigSnapshot, createAppConfigSnapshot } from "./config/context.ts";
import { effectiveJsonSchema } from "./config/schema.ts";
import { CliContext } from "./context.ts";
import { cliHelpRender } from "./help.ts";
import { maybeBootstrapInstallArgv } from "./install/bootstrap.ts";
import { bootstrapMcpEnv } from "./mcp/env.ts";
import { mcpServeStdioLoop } from "./mcp/server.ts";
import { ParseKind, type ParseResult, parse, postParseValidate } from "./parse.ts";
import { type CliSchemaExport, cliSchemaExport } from "./schema.ts";
import type { CliHandler, CliLeaf, CliNode, CliProgram, CliRouter } from "./types.ts";
import { isCliLeaf, isCliRouter } from "./types.ts";
import { cliValidateProgram } from "./validate.ts";

/** Outcome of a non-exiting CLI invocation. */
export type CliInvokeKind = "ok" | "help" | "error";

/** Result of Cli.invoke: captured output and exit metadata without process.exit. */
export interface CliInvokeResult {
  kind: CliInvokeKind;
  exitCode: number;
  stdout: string;
  stderr: string;
  errorMsg?: string;
}

class CliInvokeExit extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = "CliInvokeExit";
    this.code = code;
  }
}

interface PreparedDispatch {
  pr: ParseResult;
  parseRoot: CliNode;
  completionParseRoot: CliRouter;
  isLeafCompletionIntercept: boolean;
  leaf: CliLeaf & { handler: CliHandler };
}

/** Argsbarg runtime for a validated, frozen {@link CliProgram}. */
export class Cli {
  readonly program: CliProgram;
  readonly caps: CliCapabilities;
  private readonly parseRootMerged: CliRouter;
  private readonly presentationRoot: CliRouter;
  private _appConfig?: AnyAppConfigSnapshot;

  constructor(program: CliProgram) {
    cliValidateProgram(program);
    Object.freeze(program);
    this.program = program;
    this.caps = resolveCapabilities(program);
    this.parseRootMerged = cliParseRoot(program);
    this.presentationRoot = cliPresentationRoot(program);
  }

  get appConfig(): AnyAppConfigSnapshot {
    if (this._appConfig === undefined) {
      this._appConfig = this.buildAppConfigSnapshot({
        exitOnMissing: false,
        interactive: false,
      });
    }
    return this._appConfig;
  }

  exportCommandSchema(): CliSchemaExport {
    return cliSchemaExport(this.program);
  }

  exportAppConfigSchema(): Record<string, unknown> | undefined {
    return effectiveJsonSchema(this.program);
  }

  async run(argv: string[] = process.argv.slice(2)): Promise<never> {
    argv = maybeBootstrapInstallArgv(argv, this.program);
    assertBuiltinAllowed(argv, this.caps);

    const prep = this.prepareDispatch(argv);
    if ("error" in prep) {
      if (prep.error.kind === ParseKind.Help) {
        process.stdout.write(cliHelpRender(this.parseRootMerged, prep.error.helpPath, false));
        process.exit(prep.error.helpExplicit ? 0 : 1);
      }
      const color = process.stderr.isTTY;
      const msg = color ? `\u001B[31m${prep.error.errorMsg}\u001B[0m` : prep.error.errorMsg;
      process.stderr.write(`${msg}\n`);
      process.stderr.write(cliHelpRender(this.presentationRoot, prep.error.errorHelpPath, true));
      process.exit(1);
    }

    const { pr, completionParseRoot, isLeafCompletionIntercept, leaf } = prep;

    if (pr.kind === ParseKind.Ok) {
      await dispatchBuiltin(this.program, pr, {
        isLeafCompletionIntercept,
        parseRoot: completionParseRoot,
      });
    }

    const skipRequiredConfig = skipsRequiredAppConfigExit(pr.path, this.caps);
    const snapshot = this.buildAppConfigSnapshot({
      interactive: !skipRequiredConfig && !!process.stdin.isTTY,
      exitOnMissing: !skipRequiredConfig,
    });

    const ctx = new CliContext(
      this.program.key,
      pr.path,
      pr.args,
      pr.opts,
      this.program,
      "cli",
      snapshot,
    );
    try {
      await Promise.resolve(leaf.handler(ctx));
      process.exit(0);
    } catch (err) {
      if (err instanceof Error) {
        process.stderr.write(`${err.message}\n`);
      }
      process.exit(1);
    }
  }

  async invoke(argv: string[]): Promise<CliInvokeResult> {
    const prep = this.prepareDispatch(argv, { presentationFallback: true });
    if ("error" in prep) {
      if (prep.error.kind === ParseKind.Help) {
        return {
          kind: "help",
          exitCode: 1,
          stdout: "",
          stderr: "",
          errorMsg: "Help is not available via MCP tool calls.",
        };
      }
      return {
        kind: "error",
        exitCode: 1,
        stdout: "",
        stderr: prep.error.errorMsg,
        errorMsg: prep.error.errorMsg,
      };
    }

    const { pr, completionParseRoot, isLeafCompletionIntercept, leaf } = prep;
    const snapshot = this.buildAppConfigSnapshot({
      interactive: false,
      exitOnMissing: false,
    });

    const ctx = new CliContext(
      this.program.key,
      pr.path,
      pr.args,
      pr.opts,
      this.program,
      "mcp",
      snapshot,
    );

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
      stdout += `${format(...args)}\n`;
    };
    console.info = (...args: unknown[]) => {
      stdout += `${format(...args)}\n`;
    };
    console.warn = (...args: unknown[]) => {
      stderr += `${format(...args)}\n`;
    };
    console.error = (...args: unknown[]) => {
      stderr += `${format(...args)}\n`;
    };

    try {
      if (pr.kind === ParseKind.Ok) {
        await dispatchBuiltin(this.program, pr, {
          isLeafCompletionIntercept,
          parseRoot: completionParseRoot,
        });
      }

      await Promise.resolve(leaf.handler(ctx));
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
          stderr: `${err.message}\n`,
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

  async serveMcp(): Promise<never> {
    try {
      if (this.program.mcpServer) {
        bootstrapMcpEnv(this.program.mcpServer);
      }
      bootstrapAppConfig(this.program, { validateFile: false });
      await mcpServeStdioLoop(this);
      process.exit(0);
    } catch (err) {
      if (err instanceof Error) {
        process.stderr.write(`${err.message}\n`);
      } else {
        process.stderr.write("MCP server error.\n");
      }
      process.exit(1);
    }
  }

  private prepareDispatch(
    argv: string[],
    opts?: { presentationFallback?: boolean },
  ): PreparedDispatch | { error: ParseResult } {
    const program = this.program;
    let parseRoot: CliNode;
    let completionParseRoot: CliRouter = opts?.presentationFallback
      ? this.presentationRoot
      : this.parseRootMerged;
    let isLeafCompletionIntercept = false;

    if (isCliLeaf(program)) {
      const intercept = builtinInterceptRoot(program, argv);
      if (intercept.isLeafCompletionIntercept || intercept.parseRoot !== program) {
        parseRoot = intercept.parseRoot;
        completionParseRoot = isCliRouter(intercept.parseRoot)
          ? intercept.parseRoot
          : opts?.presentationFallback
            ? this.presentationRoot
            : this.parseRootMerged;
        isLeafCompletionIntercept = intercept.isLeafCompletionIntercept;
      } else {
        parseRoot = program;
      }
    } else {
      parseRoot = this.parseRootMerged;
    }

    let pr = parse(parseRoot, argv);
    pr = postParseValidate(parseRoot, pr);

    if (pr.kind !== ParseKind.Ok) {
      return { error: pr };
    }

    let current: CliNode = parseRoot;
    for (const seg of pr.path) {
      if (!isCliRouter(current)) {
        const msg = "Internal error: missing handler for path.";
        return {
          error: {
            kind: ParseKind.Error,
            path: pr.path,
            args: pr.args,
            opts: pr.opts,
            helpExplicit: false,
            helpPath: [],
            errorMsg: msg,
            errorHelpPath: pr.path,
          },
        };
      }
      const ch = current.commands.find((candidate) => candidate.key === seg);
      if (!ch) {
        const msg = "Internal error: missing handler for path.";
        return {
          error: {
            kind: ParseKind.Error,
            path: pr.path,
            args: pr.args,
            opts: pr.opts,
            helpExplicit: false,
            helpPath: [],
            errorMsg: msg,
            errorHelpPath: pr.path,
          },
        };
      }
      current = ch;
    }

    if (!isCliLeaf(current) || !current.handler) {
      const msg = "Internal error: missing handler for path.";
      return {
        error: {
          kind: ParseKind.Error,
          path: pr.path,
          args: pr.args,
          opts: pr.opts,
          helpExplicit: false,
          helpPath: [],
          errorMsg: msg,
          errorHelpPath: pr.path,
        },
      };
    }

    return {
      pr,
      parseRoot,
      completionParseRoot,
      isLeafCompletionIntercept,
      leaf: current,
    };
  }

  private buildAppConfigSnapshot(opts: EnsureAppConfigOpts): AnyAppConfigSnapshot {
    const bootstrap = ensureAppConfig(this.program, opts);
    const snapshot = bootstrap
      ? createAppConfigSnapshot(this.program, bootstrap.fileData, bootstrap.resolved)
      : createAppConfigSnapshot(this.program, {}, {});
    this._appConfig = snapshot;
    return snapshot;
  }
}
