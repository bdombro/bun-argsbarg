import { describe, expect, test, afterEach } from "bun:test";
import { cliBuiltinInstallCommand, installBuiltinOptions } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliPresentationRoot } from "./presentation.ts";
import { completionBashScript, completionFishScript, completionZshScript } from "./index.ts";
import { exportPresentationBuiltins } from "./export.ts";
import { CliProgram } from "../types.ts";
import { setCompiledExecutableOverride } from "../install/compiled.ts";

const fixture: CliProgram = {
  key: "myapp",
  description: "Demo app.",
  mcpServer: { name: "myapp" },
  commands: [
    {
      key: "hello",
      description: "Say hello.",
      handler: () => {},
    },
  ],
};

afterEach(() => {
  setCompiledExecutableOverride(null);
});

describe("builtins help copy", () => {
  test("install command includes description and option text when compiled", () => {
    setCompiledExecutableOverride(true);
    const install = cliBuiltinInstallCommand(fixture);
    expect(install.description).toContain("Install the binary");
    expect(install.notes).toContain("bun build --compile");
    const names = installBuiltinOptions(fixture).map((o) => o.name);
    expect(names).toContain("all");
    expect(names).toContain("mcp");
    expect(names).toContain("prefix");
  });

  test("install omits --mcp option when mcpServer unset", () => {
    setCompiledExecutableOverride(true);
    const noMcp: CliProgram = { key: "x", description: "x", handler: () => {} };
    const names = installBuiltinOptions(noMcp).map((o) => o.name);
    expect(names).not.toContain("mcp");
  });

  test("mcp builtin description is user-facing", () => {
    const mcp = cliBuiltinMcpCommand();
    expect(mcp.description).toContain("MCP server");
    expect(mcp.notes).toContain('["mcp"]');
  });
});

describe("presentation root", () => {
  test("includes mcp when mcpServer set", () => {
    setCompiledExecutableOverride(false);
    const root = cliPresentationRoot(fixture);
    expect(root.commands?.map((c) => c.key)).toContain("mcp");
    expect(root.commands?.map((c) => c.key)).not.toContain("install");
  });

  test("includes install when compiled", () => {
    setCompiledExecutableOverride(true);
    const root = cliPresentationRoot(fixture);
    expect(root.commands?.map((c) => c.key)).toContain("install");
  });
});

describe("completion emitters", () => {
  test("fish script references app key and subcommands", () => {
    setCompiledExecutableOverride(true);
    const schema = cliPresentationRoot(fixture);
    const fish = completionFishScript(schema);
    expect(fish).toContain("complete -c myapp");
    expect(fish).toContain("hello");
    expect(fish).toContain("install");
  });

  test("bash script includes install flags when compiled", () => {
    setCompiledExecutableOverride(true);
    const schema = cliPresentationRoot(fixture);
    const bash = completionBashScript(schema);
    expect(bash).toContain("--all");
    expect(bash).toContain("install");
  });

  test("zsh script registers compdef", () => {
    const schema = cliPresentationRoot({ key: "zapp", description: "z", handler: () => {} });
    const zsh = completionZshScript(schema);
    expect(zsh).toContain("#compdef zapp");
    expect(zsh).toContain("compdef _zapp zapp");
  });
});

describe("schema export builtins", () => {
  test("exportPresentationBuiltins includes install options when compiled", () => {
    setCompiledExecutableOverride(true);
    const builtins = exportPresentationBuiltins(fixture);
    const install = builtins.find((b) => b.key === "install");
    expect(install?.options?.find((o) => o.name === "all")?.description).toContain("binary");
  });
});
