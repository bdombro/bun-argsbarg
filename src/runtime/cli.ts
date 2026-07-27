/*
Runtime entry point: validate program, cache derived state, run / invoke / MCP serve.
*/

import { randomUUID } from "node:crypto";
import { format } from "node:util";
import { builtinInterceptRoot, dispatchBuiltin } from "../builtins/dispatch.ts";
import { cliParseRoot, cliPresentationRoot } from "../builtins/presentation.ts";
import { bootstrapAppConfig, type EnsureAppConfigOpts, ensureAppConfig } from "../config/bootstrap.ts";
import { type AnyAppConfigSnapshot, createAppConfigSnapshot } from "../config/context.ts";
import { readAppConfigFileRaw, resolveAppConfigPath } from "../config/file.ts";
import { effectiveJsonSchema } from "../config/schema.ts";
import { CliContext } from "../core/context.ts";
import { LeafInputError, preloadPipableJson } from "../core/leaf-inputs.ts";
import { ParseKind, type ParseResult, parse, postParseValidate } from "../core/parse.ts";
import { type CliSchemaRootExport, cliSchemaExport } from "../core/schema.ts";
import type {
  CliHandler,
  CliInvocation,
  CliLeaf,
  CliLocals,
  CliNode,
  CliProgram,
  CliRespondOptions,
  CliRouter,
  InvokeFailureKind,
} from "../core/types.ts";
import { isCliLeaf, isCliRouter } from "../core/types.ts";
import { cliValidateProgram } from "../core/validate.ts";
import { cliHelpRender } from "../help.ts";
import { isBuiltinInvokePath } from "../hooks/builtin.ts";
import { buildInvokeHookContext, classifyFailureKind, runErrorPipeline, runHook } from "../hooks/run.ts";
import { httpServeHttp } from "../http/server.ts";
import { LogEmitter } from "../log/emitter.ts";
import { bootstrapMcpEnv } from "../mcp/env.ts";
import { mcpServeStdioLoop } from "../mcp/server.ts";
import { createServerRuntime, type ServerHandleContext } from "../server/context.ts";
import { resolveHttpServeConfig, resolveMcpServeConfig, type ServeOverrides } from "../server/overrides.ts";
import {
  assertBuiltinAllowed,
  type CliCapabilities,
  resolveCapabilities,
  skipsRequiredAppConfigExit,
} from "./capabilities.ts";

/** Outcome of a non-exiting CLI invocation. */
export type CliInvokeKind = "ok" | "help" | "error";

/** Result of Cli.invoke: captured output and exit metadata without process.exit. */
export interface CliInvokeResult {
  kind: CliInvokeKind;
  exitCode: number;
  stdout: string;
  stderr: string;
  errorMsg?: string;
  /** Classified failure for HTTP/MCP status mapping. */
  failureKind?: InvokeFailureKind;
  /** Headless response payload when invocation is `api` or `mcp` and the handler succeeded. */
  response?: CliRespondOptions;
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
  /** Active HTTP/MCP server handle (set during serve). */
  server?: ServerHandleContext;

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

  exportCommandSchema(): CliSchemaRootExport {
    return cliSchemaExport(this.program);
  }

  exportAppConfigSchema(): Record<string, unknown> | undefined {
    return effectiveJsonSchema(this.program);
  }

  async run(argv: string[] = process.argv.slice(2)): Promise<never> {
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

    let preloadedJson: Record<string, unknown> = {};
    try {
      preloadedJson = await preloadPipableJson(this.program, pr.path, pr.opts, "cli", pr.args);
    } catch (err) {
      if (err instanceof LeafInputError) {
        this.exitLeafInputError(err, pr.path);
      }
      const msg = err instanceof Error ? err.message : String(err);
      const color = process.stderr.isTTY;
      process.stderr.write(color ? `\u001B[31m${msg}\u001B[0m\n` : `${msg}\n`);
      process.exit(1);
    }

    const ctx = new CliContext(
      this.program.key,
      pr.path,
      pr.args,
      pr.opts,
      this.program,
      "cli",
      snapshot,
      undefined,
      preloadedJson,
      pr.pathParams,
      { requestId: randomUUID() } as CliLocals,
    );
    try {
      this.ensureValidatedLeafInputs(ctx, leaf);
      const handlerResult = await Promise.resolve(leaf.handler(ctx));
      if (handlerResult !== undefined && ctx.getResponse() === undefined) {
        ctx.respond({ body: handlerResult as CliRespondOptions["body"] });
      }
      process.exit(0);
    } catch (err) {
      if (err instanceof LeafInputError) {
        this.exitLeafInputError(err, pr.path);
      }
      if (err instanceof Error) {
        process.stderr.write(`${err.message}\n`);
      }
      process.exit(1);
    }
  }

  async invoke(
    argv: string[],
    opts?: {
      invocation?: CliInvocation;
      toolArgs?: Record<string, unknown>;
      requestId?: string;
      http?: { request: Request; clientIp: string; requestId: string; traceId?: string; spanId?: string };
      mcp?: { rpcMethod: string; toolName?: string; requestId: string };
    },
  ): Promise<CliInvokeResult> {
    const invocation = opts?.invocation ?? "mcp";
    const prep = this.prepareDispatch(argv, { presentationFallback: true });
    if ("error" in prep) {
      if (prep.error.kind === ParseKind.Help) {
        return {
          kind: "help",
          exitCode: 1,
          stdout: "",
          stderr: "",
          errorMsg: "Help is not available via tool calls.",
          failureKind: "help",
        };
      }
      return {
        kind: "error",
        exitCode: 1,
        stdout: "",
        stderr: prep.error.errorMsg,
        errorMsg: prep.error.errorMsg,
        failureKind: "validation",
      };
    }

    const { pr, completionParseRoot, isLeafCompletionIntercept, leaf } = prep;
    const snapshot = this.buildAppConfigSnapshot({
      interactive: false,
      exitOnMissing: false,
    });

    const runtime = this.server?.runtime;
    const requestId = opts?.requestId ?? opts?.http?.requestId ?? opts?.mcp?.requestId ?? randomUUID();
    const ctx = new CliContext(
      this.program.key,
      pr.path,
      pr.args,
      pr.opts,
      this.program,
      invocation,
      snapshot,
      opts?.toolArgs,
      {},
      pr.pathParams,
      { requestId } as CliLocals,
      runtime,
    );

    const skipHooks = isBuiltinInvokePath(pr.path);
    const hooks = this.program.hooks;
    const obscureUnexpected =
      invocation === "http"
        ? (this.server?.http?.obscureUnexpected ?? this.program.httpServer?.errors?.obscureUnexpected ?? false)
        : invocation === "mcp"
          ? (this.server?.mcp?.obscureUnexpected ?? this.program.mcpServer?.errors?.obscureUnexpected ?? false)
          : false;
    const emitter = this.server?.emitter;

    const hookCtx = () =>
      buildInvokeHookContext(ctx, {
        path: pr.path,
        runtime,
        http: opts?.http,
        mcp: opts?.mcp,
      });

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

    const finishError = async (
      err: unknown,
      kindOpts: Parameters<typeof classifyFailureKind>[1],
    ): Promise<CliInvokeResult> => {
      const failureKind = classifyFailureKind(err, kindOpts);
      if (!skipHooks) {
        const piped = await runErrorPipeline(hookCtx(), err, failureKind, hooks, emitter, obscureUnexpected);
        return {
          kind: "error",
          exitCode: piped.clientError.exitCode ?? 1,
          stdout,
          stderr: `${piped.errorMsg}\n`,
          errorMsg: piped.errorMsg,
          failureKind: piped.failureKind,
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        kind: "error",
        exitCode: 1,
        stdout,
        stderr: `${message}\n`,
        errorMsg: message,
        failureKind,
      };
    };

    try {
      if (pr.kind === ParseKind.Ok) {
        await dispatchBuiltin(this.program, pr, {
          isLeafCompletionIntercept,
          parseRoot: completionParseRoot,
        });
      }

      if (!skipHooks) {
        await runHook(() => hooks?.beforeInvoke?.(hookCtx()), "beforeInvoke");
      }

      this.ensureValidatedLeafInputs(ctx, leaf);
      const handlerResult = await Promise.resolve(leaf.handler(ctx));
      if (handlerResult !== undefined && ctx.getResponse() === undefined) {
        ctx.respond({ body: handlerResult as CliRespondOptions["body"] });
      }

      const response = ctx.getResponse();
      const okResult: CliInvokeResult = {
        kind: "ok",
        exitCode: 0,
        stdout,
        stderr,
        ...(response ? { response } : {}),
      };

      if (!skipHooks) {
        await runHook(() => hooks?.afterInvoke?.({ ...hookCtx(), result: okResult }), "afterInvoke");
      }

      return okResult;
    } catch (err) {
      if (err instanceof CliInvokeExit) {
        if (err.code === 0) {
          const response = ctx.getResponse();
          const okResult: CliInvokeResult = {
            kind: "ok",
            exitCode: 0,
            stdout,
            stderr,
            ...(response ? { response } : {}),
          };
          if (!skipHooks) {
            await runHook(() => hooks?.afterInvoke?.({ ...hookCtx(), result: okResult }), "afterInvoke");
          }
          return okResult;
        }
        return finishError(err, {});
      }
      if (err instanceof LeafInputError) {
        return finishError(err, { parseError: true });
      }
      if (err instanceof Error) {
        return finishError(err, {});
      }
      return finishError(err, {});
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

  async serveMcp(overrides: ServeOverrides = {}): Promise<never> {
    try {
      if (this.program.mcpServer) {
        bootstrapMcpEnv(this.program.mcpServer);
      }
      const resolved = resolveMcpServeConfig(this.program, overrides);
      const runtime = createServerRuntime(this.program, "mcp");
      const emitter = new LogEmitter({ program: this.program, resolved: resolved.log });
      this.server = {
        runtime,
        emitter,
        mcp: resolved,
        mcpHooks: this.program.mcpServer?.hooks,
      };
      bootstrapAppConfig(this.program, { validateFile: "soft", runtime, emitter });
      const shutdown = () => {
        emitter.emit({ level: "info", message: "server stopping", action: "server.stop" });
        process.exit(0);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      emitter.emitLifecycle(`${this.program.key} ${this.program.version} — MCP ready (stdio)`, "mcp.server.ready");
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

  async serveHttp(overrides: ServeOverrides = {}): Promise<never> {
    try {
      const resolved = resolveHttpServeConfig(this.program, overrides);
      const runtime = createServerRuntime(this.program, "http");
      const emitter = new LogEmitter({ program: this.program, resolved: resolved.log });
      this.server = {
        runtime,
        emitter,
        http: resolved,
        httpHooks: this.program.httpServer?.hooks,
      };
      bootstrapAppConfig(this.program, { validateFile: "soft", runtime, emitter });
      const shutdown = () => {
        emitter.emit({ level: "info", message: "server stopping", action: "server.stop" });
        process.exit(0);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      await httpServeHttp(this, resolved);
      process.exit(0);
    } catch (err) {
      if (err instanceof Error) {
        process.stderr.write(`${err.message}\n`);
      } else {
        process.stderr.write("HTTP API server error.\n");
      }
      process.exit(1);
    }
  }

  private ensureValidatedLeafInputs(ctx: CliContext, leaf: CliLeaf): void {
    if (leaf.inputSchema === undefined) {
      return;
    }
    ctx.inputs;
  }

  private exitLeafInputError(err: LeafInputError, helpPath: string[]): never {
    const color = process.stderr.isTTY;
    const msg = color ? `\u001B[31m${err.message}\u001B[0m` : err.message;
    process.stderr.write(`${msg}\n`);
    process.stderr.write(cliHelpRender(this.presentationRoot, helpPath, true));
    process.exit(1);
  }

  private prepareDispatch(
    argv: string[],
    opts?: { presentationFallback?: boolean },
  ): PreparedDispatch | { error: ParseResult } {
    const program = this.program;
    let parseRoot: CliNode;
    let completionParseRoot: CliRouter = opts?.presentationFallback ? this.presentationRoot : this.parseRootMerged;
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
            pathParams: pr.pathParams,
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
            pathParams: pr.pathParams,
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
          pathParams: pr.pathParams,
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
      : createAppConfigSnapshot(this.program, readAppConfigFileRaw(resolveAppConfigPath(this.program)), {});
    this._appConfig = snapshot;
    return snapshot;
  }
}
