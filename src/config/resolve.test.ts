import { describe, expect, test } from "bun:test";
import type { CliProgram } from "../types.ts";
import { captureMappedHostEnv, exportConfigToEnv, resolveAppConfig } from "./resolve.ts";

const program: CliProgram = {
  key: "app",
  version: "1.0.0",
  description: "Test.",
  appConfig: {
    jsonSchema: {
      type: "object",
      properties: {
        apiToken: { type: "string" },
        maxRetries: { type: "integer", default: 3 },
        region: { type: "string", default: "us-east-1" },
      },
      required: ["apiToken"],
    },
    entries: {
      apiToken: { description: "Token.", env: "API_TOKEN" },
      maxRetries: { description: "Retries." },
      region: { description: "Region.", required: false },
    },
  },
  handler: () => {},
};

describe("config/resolve", () => {
  test("prefers env over file for mapped keys", () => {
    const prev = process.env.API_TOKEN;
    process.env.API_TOKEN = "from-env";
    try {
      const resolved = resolveAppConfig(program, { apiToken: "from-file" });
      expect(resolved.apiToken).toBe("from-env");
    } finally {
      if (prev === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prev;
    }
  });

  test("uses file when env empty", () => {
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const resolved = resolveAppConfig(program, { apiToken: "from-file" });
      expect(resolved.apiToken).toBe("from-file");
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
    }
  });

  test("empty string in env or file counts as missing", () => {
    const prev = process.env.API_TOKEN;
    process.env.API_TOKEN = "";
    try {
      const resolved = resolveAppConfig(program, { apiToken: "" });
      expect(resolved.apiToken).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prev;
    }
  });

  test("applies jsonSchema default when file and env absent", () => {
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const resolved = resolveAppConfig(program, { apiToken: "ok" });
      expect(resolved.maxRetries).toBe(3);
      expect(resolved.region).toBe("us-east-1");
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
    }
  });

  test("all-string mode uses entry.default", () => {
    const stringProgram: CliProgram = {
      ...program,
      appConfig: {
        entries: {
          greeting: { description: "Hello.", default: "world" },
        },
      },
    };
    const resolved = resolveAppConfig(stringProgram, {});
    expect(resolved.greeting).toBe("world");
  });

  test("prefers captured host env over file when process.env was exported from file", () => {
    const hostEnv = { API_TOKEN: "from-host" };
    process.env.API_TOKEN = "from-file-export";
    try {
      const resolved = resolveAppConfig(program, { apiToken: "from-file" }, hostEnv);
      expect(resolved.apiToken).toBe("from-host");
    } finally {
      delete process.env.API_TOKEN;
    }
  });

  test("exportConfigToEnv does not overwrite host env", () => {
    const prev = process.env.API_TOKEN;
    process.env.API_TOKEN = "from-host";
    const hostEnv = captureMappedHostEnv(program);
    try {
      exportConfigToEnv(program, { apiToken: "from-file" }, hostEnv);
      expect(process.env.API_TOKEN).toBe("from-host");
    } finally {
      if (prev === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prev;
    }
  });

  test("resolve callback supplies value when env and file are absent", () => {
    const resolveProgram: CliProgram = {
      ...program,
      appConfig: {
        ...program.appConfig!,
        entries: {
          ...program.appConfig!.entries,
          apiToken: {
            description: "Token.",
            env: "API_TOKEN",
            resolve: () => "from-resolve",
          },
        },
      },
    };
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const resolved = resolveAppConfig(resolveProgram, {});
      expect(resolved.apiToken).toBe("from-resolve");
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
    }
  });

  test("env overrides resolve callback", () => {
    const resolveProgram: CliProgram = {
      ...program,
      appConfig: {
        ...program.appConfig!,
        entries: {
          ...program.appConfig!.entries,
          apiToken: {
            description: "Token.",
            env: "API_TOKEN",
            resolve: () => "from-resolve",
          },
        },
      },
    };
    const prev = process.env.API_TOKEN;
    process.env.API_TOKEN = "from-env";
    try {
      const resolved = resolveAppConfig(resolveProgram, {});
      expect(resolved.apiToken).toBe("from-env");
    } finally {
      if (prev === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prev;
    }
  });

  test("file overrides resolve callback", () => {
    const resolveProgram: CliProgram = {
      ...program,
      appConfig: {
        ...program.appConfig!,
        entries: {
          ...program.appConfig!.entries,
          apiToken: {
            description: "Token.",
            env: "API_TOKEN",
            resolve: () => "from-resolve",
          },
        },
      },
    };
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const resolved = resolveAppConfig(resolveProgram, { apiToken: "from-file" });
      expect(resolved.apiToken).toBe("from-file");
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
    }
  });

  test("falls back to env when resolve returns undefined", () => {
    const resolveProgram: CliProgram = {
      ...program,
      appConfig: {
        ...program.appConfig!,
        entries: {
          ...program.appConfig!.entries,
          apiToken: {
            description: "Token.",
            env: "API_TOKEN",
            resolve: () => undefined,
          },
        },
      },
    };
    const hostEnv = { API_TOKEN: "from-env-fallback" };
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      const resolved = resolveAppConfig(resolveProgram, {}, hostEnv);
      expect(resolved.apiToken).toBe("from-env-fallback");
    } finally {
      if (prev !== undefined) process.env.API_TOKEN = prev;
    }
  });

  test("resolve callback is skipped when env is set", () => {
    let resolveCalled = false;
    const resolveProgram: CliProgram = {
      ...program,
      appConfig: {
        ...program.appConfig!,
        entries: {
          ...program.appConfig!.entries,
          apiToken: {
            description: "Token.",
            env: "API_TOKEN",
            resolve: () => {
              resolveCalled = true;
              return "from-resolve";
            },
          },
        },
      },
    };
    const prev = process.env.API_TOKEN;
    process.env.API_TOKEN = "from-env";
    try {
      const resolved = resolveAppConfig(resolveProgram, {});
      expect(resolved.apiToken).toBe("from-env");
      expect(resolveCalled).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prev;
    }
  });

  test("async resolve is ignored with stderr warning", () => {
    const resolveProgram: CliProgram = {
      ...program,
      appConfig: {
        ...program.appConfig!,
        entries: {
          ...program.appConfig!.entries,
          apiToken: {
            description: "Token.",
            env: "API_TOKEN",
            resolve: async () => "from-async-resolve",
          },
        },
      },
    };
    const prev = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    const prevStderr = process.stderr.write;
    const stderrLines: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrLines.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const resolved = resolveAppConfig(resolveProgram, {}, { API_TOKEN: undefined });
      expect(resolved.apiToken).toBeUndefined();
      expect(stderrLines.join("")).toContain("returned a Promise");
    } finally {
      process.stderr.write = prevStderr;
      if (prev === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = prev;
    }
  });
});
