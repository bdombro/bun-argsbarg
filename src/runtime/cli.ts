/*
Runtime entry point: validate program, cache derived state, run / invoke / MCP serve.
*/

import { randomUUID } from "node:crypto";
import { format } from "node:util";
import type { z } from "zod";
import { builtinInterceptRoot, dispatchBuiltin } from "../builtins/dispatch.ts";
import { cliParseRoot, cliPresentationRoot } from "../builtins/presentation.ts";
import { bootstrapAppConfig, type EnsureAppConfigOpts, ensureAppConfig } from "../config/bootstrap.ts";
import { type AnyAppConfigSnapshot, createAppConfigSnapshot } from "../config/context.ts";
import { readAppConfigFileRaw, resolveAppConfigPath } from "../config/file.ts";
import { effectiveJsonSchema } from "../config/schema.ts";
import { CommandContext } from "../core/context.ts";
import { InputError, preloadPipableJson } from "../core/leaf-inputs.ts";
import { ParseKind, type ParseResult, parse, postParseValidate } from "../core/parse.ts";
import { type SchemaRootExport, schemaExport } from "../core/schema.ts";
import type {
  AppSpec,
  AppSpecFields,
  Command,
  CommandDef,
  CommandGroup,
  CommandOption,
  CommandPositional,
  Invocation,
  InvokeFailureKind,
  JsonSchema,
  Locals,
  RespondOptions,
  RunnableCommand,
} from "../core/types.ts";
import { hasHandler, hasSubcommands } from "../core/types.ts";
import { cliValidateProgram, schemaStrictnessWarnings } from "../core/validate.ts";
import { cliHelpRender } from "../help.ts";
import { isBuiltinInvokePath } from "../hooks/builtin.ts";
import { buildInvokeHookContext, classifyFailureKind, runErrorPipeline, runHook } from "../hooks/run.ts";
import { httpServeHttp } from "../http/server.ts";
import { LogEmitter } from "../log/emitter.ts";
import { bootstrapMcpEnv } from "../mcp/env.ts";
import { MCP_PROTOCOL_VERSIONS, mcpServeStdioLoop } from "../mcp/server.ts";
import { mcpSizeReport } from "../mcp/tools.ts";
import { createServerRuntime, type ServerHandleContext } from "../server/context.ts";
import { resolveHttpServeConfig, resolveMcpServeConfig, type ServeOverrides } from "../server/overrides.ts";
import {
  assertBuiltinAllowed,
  type Capabilities,
  resolveCapabilities,
  skipsRequiredAppConfigExit,
} from "./capabilities.ts";

/** Outcome of a non-exiting CLI invocation. */
export type InvokeKind = "ok" | "help" | "error";

/** Result of App.invoke: captured output and exit metadata without process.exit. */
export interface InvokeResult {
  kind: InvokeKind;
  exitCode: number;
  stdout: string;
  stderr: string;
  errorMsg?: string;
  /** Classified failure for HTTP/MCP status mapping. */
  failureKind?: InvokeFailureKind;
  /** Headless response payload when invocation is `api` or `mcp` and the handler succeeded. */
  response?: RespondOptions;
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
  parseRoot: Command;
  completionParseRoot: CommandGroup;
  isLeafCompletionIntercept: boolean;
  leaf: RunnableCommand;
}

/**
 * Builds an argsbarg app: validates and freezes the spec, then returns the runtime (`await app.run()`).
 * A runnable root (`handler`) gets `ctx.inputs` typed from its `inputSchema` or `options` / `positionals`, like
 * {@link command}.
 */
export function argsbarg<const T extends CommandGroup & AppSpecFields>(
  /** Spec whose root groups commands. */
  spec: T,
): App;
export function argsbarg<
  I extends z.ZodType | undefined = undefined,
  O extends z.ZodType | undefined = undefined,
  const Opts extends readonly CommandOption[] = [],
  const Pos extends readonly CommandPositional[] = [],
>(
  /** Spec whose root runs a handler (a one-command CLI). */
  spec: CommandDef<I, O, undefined, Opts, Pos> & AppSpecFields,
): App;
export function argsbarg(
  /** Already-typed app spec. */
  spec: AppSpec,
): App;
export function argsbarg(
  /** App spec. */
  spec: AppSpec,
): App {
  return new App(spec);
}

/** Argsbarg runtime for a validated, frozen {@link AppSpec}. */
export class App {
  readonly spec: AppSpec;
  readonly caps: Capabilities;
  private readonly parseRootMerged: CommandGroup;
  private readonly presentationRoot: CommandGroup;
  private _appConfig?: AnyAppConfigSnapshot;
  /** Active HTTP/MCP server handle (set during serve). */
  server?: ServerHandleContext;

  constructor(program: AppSpec) {
    cliValidateProgram(program);
    Object.freeze(program);
    this.spec = program;
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

  exportCommandSchema(): SchemaRootExport {
    return schemaExport(this.spec);
  }

  exportAppConfigSchema(): JsonSchema | undefined {
    return effectiveJsonSchema(this.spec);
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
      await dispatchBuiltin(this.spec, pr, {
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
      preloadedJson = await preloadPipableJson(this.spec, pr.path, pr.opts, "cli", pr.args);
    } catch (err) {
      if (err instanceof InputError) {
        this.exitLeafInputError(err, pr.path);
      }
      const msg = err instanceof Error ? err.message : String(err);
      const color = process.stderr.isTTY;
      process.stderr.write(color ? `\u001B[31m${msg}\u001B[0m\n` : `${msg}\n`);
      process.exit(1);
    }

    const ctx = new CommandContext(
      this.spec.key,
      pr.path,
      pr.args,
      pr.opts,
      this.spec,
      "cli",
      snapshot,
      undefined,
      preloadedJson,
      pr.pathParams,
      { requestId: randomUUID() } as Locals,
    );
    try {
      this.ensureValidatedLeafInputs(ctx, leaf);
      const handlerResult = await Promise.resolve(leaf.handler(ctx));
      if (handlerResult !== undefined && ctx.getResponse() === undefined) {
        ctx.respond({ body: handlerResult as RespondOptions["body"] });
      }
      process.exit(0);
    } catch (err) {
      if (err instanceof InputError) {
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
      invocation?: Invocation;
      toolArgs?: Record<string, unknown>;
      requestId?: string;
      http?: { request: Request; clientIp: string; requestId: string; traceId?: string; spanId?: string };
      mcp?: { rpcMethod: string; toolName?: string; requestId: string };
    },
  ): Promise<InvokeResult> {
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
    const ctx = new CommandContext(
      this.spec.key,
      pr.path,
      pr.args,
      pr.opts,
      this.spec,
      invocation,
      snapshot,
      opts?.toolArgs,
      {},
      pr.pathParams,
      { requestId } as Locals,
      runtime,
    );

    const skipHooks = isBuiltinInvokePath(pr.path);
    const hooks = this.spec.hooks;
    const obscureUnexpected =
      invocation === "http"
        ? (this.server?.http?.obscureUnexpected ?? this.spec.httpServer?.errors?.obscureUnexpected ?? false)
        : invocation === "mcp"
          ? (this.server?.mcp?.obscureUnexpected ?? this.spec.mcpServer?.errors?.obscureUnexpected ?? false)
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
    ): Promise<InvokeResult> => {
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
        await dispatchBuiltin(this.spec, pr, {
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
        ctx.respond({ body: handlerResult as RespondOptions["body"] });
      }

      const response = ctx.getResponse();
      const okResult: InvokeResult = {
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
          const okResult: InvokeResult = {
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
      if (err instanceof InputError) {
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
      if (this.spec.mcpServer) {
        bootstrapMcpEnv(this.spec.mcpServer);
      }
      const resolved = resolveMcpServeConfig(this.spec, overrides);
      const runtime = createServerRuntime(this.spec, "mcp");
      const emitter = new LogEmitter({ spec: this.spec, resolved: resolved.log });
      this.server = {
        runtime,
        emitter,
        mcp: resolved,
        mcpHooks: this.spec.mcpServer?.hooks,
        mcpProtocolVersion: MCP_PROTOCOL_VERSIONS[0],
      };
      bootstrapAppConfig(this.spec, { validateFile: "soft", runtime, emitter });
      const shutdown = () => {
        emitter.emit({ level: "info", message: "server stopping", action: "server.stop" });
        process.exit(0);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      for (const message of mcpSizeReport(this.spec).warnings) {
        emitter.emit({ level: "warn", message, action: "mcp.size" });
      }
      for (const message of schemaStrictnessWarnings(this.spec)) {
        emitter.emit({ level: "warn", message, action: "schema.strictness" });
      }
      emitter.emitLifecycle(`${this.spec.key} ${this.spec.version} — MCP ready (stdio)`, "mcp.server.ready");
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
      const resolved = resolveHttpServeConfig(this.spec, overrides);
      const runtime = createServerRuntime(this.spec, "http");
      const emitter = new LogEmitter({ spec: this.spec, resolved: resolved.log });
      this.server = {
        runtime,
        emitter,
        http: resolved,
        httpHooks: this.spec.httpServer?.hooks,
      };
      bootstrapAppConfig(this.spec, { validateFile: "soft", runtime, emitter });
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

  private ensureValidatedLeafInputs(ctx: CommandContext, leaf: RunnableCommand): void {
    if (leaf.pathParams !== undefined) {
      ctx.pathParams;
    }
    if (leaf.inputSchema !== undefined) {
      ctx.inputs;
    }
  }

  private exitLeafInputError(err: InputError, helpPath: string[]): never {
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
    const program = this.spec;
    let parseRoot: Command;
    let completionParseRoot: CommandGroup = opts?.presentationFallback ? this.presentationRoot : this.parseRootMerged;
    let isLeafCompletionIntercept = false;

    if (hasHandler(program)) {
      const intercept = builtinInterceptRoot(program, argv);
      if (intercept.isLeafCompletionIntercept || intercept.parseRoot !== program) {
        parseRoot = intercept.parseRoot;
        completionParseRoot = hasSubcommands(intercept.parseRoot)
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

    let current: Command = parseRoot;
    for (const seg of pr.path) {
      if (!hasSubcommands(current)) {
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

    if (!hasHandler(current) || !current.handler) {
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
    const bootstrap = ensureAppConfig(this.spec, opts);
    const snapshot = bootstrap
      ? createAppConfigSnapshot(this.spec, bootstrap.fileData, bootstrap.resolved)
      : createAppConfigSnapshot(this.spec, readAppConfigFileRaw(resolveAppConfigPath(this.spec)), {});
    this._appConfig = snapshot;
    return snapshot;
  }
}
