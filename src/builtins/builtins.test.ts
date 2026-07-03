import { describe, expect, test } from "bun:test";
import { ParseKind, parse, postParseValidate } from "../parse.ts";
import type { CliProgram } from "../types.ts";
import { exportPresentationBuiltins } from "./export.ts";
import { completionBashScript, completionFishScript, completionZshScript } from "./index.ts";
import { cliBuiltinInstallCommand, installBuiltinOptions } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliParseRoot, cliPresentationRoot } from "./presentation.ts";
import { cliBuiltinUninstallCommand, uninstallBuiltinOptions } from "./uninstall.ts";

const fixture: CliProgram = {
  key: "myapp",
  version: "0.0.0",
  description: "Demo app.",
  mcpServer: { enabled: true },
  commands: [
    {
      key: "hello",
      description: "Say hello.",
      handler: () => {},
    },
  ],
};

describe("builtins help copy", () => {
  test("install command includes Homebrew-oriented description", () => {
    const install = cliBuiltinInstallCommand(fixture);
    expect(install.description).toContain("agent skills");
    expect(install.notes).toContain("brew install");
    const names = installBuiltinOptions(fixture).map((o) => o.name);
    expect(names).toContain("all");
    expect(names).toContain("mcp");
    expect(names).not.toContain("app");
    expect(names).not.toContain("completions");
    expect(names).not.toContain("update");
    expect(names.indexOf("all")).toBeLessThan(names.indexOf("mcp"));
    expect(names.indexOf("mcp")).toBeLessThan(names.indexOf("status"));
    expect(names).not.toContain("uninstall");
    const yesOpt = installBuiltinOptions(fixture).find((o) => o.name === "yes");
    expect(yesOpt?.shortName).toBe("y");
  });

  test("uninstall command includes removal guidance", () => {
    const uninstall = cliBuiltinUninstallCommand(fixture);
    expect(uninstall.notes).toContain("brew uninstall");
    const names = uninstallBuiltinOptions(fixture).map((o) => o.name);
    expect(names).toContain("all");
    expect(names).not.toContain("status");
    expect(names).not.toContain("reinstall");
  });

  test("install -y parses as --yes", () => {
    const root = cliParseRoot(fixture);
    const pr = postParseValidate(root, parse(root, ["install", "-y"]));
    expect(pr.kind).toBe(ParseKind.Ok);
    if (pr.kind === ParseKind.Ok) {
      expect(pr.opts.yes).toBe("1");
    }
  });

  test("install omits --mcp option when mcpServer unset", () => {
    const noMcp: CliProgram = { key: "x", version: "0.0.0", description: "x", handler: () => {} };
    const names = installBuiltinOptions(noMcp).map((o) => o.name);
    expect(names).not.toContain("mcp");
  });

  test("install notes mention brew upgrade", () => {
    const install = cliBuiltinInstallCommand(fixture);
    expect(install.notes).toContain("brew upgrade");
    expect(install.notes).toContain("install --configure");
  });

  test("mcp builtin description is user-facing", () => {
    const withDocs: CliProgram = {
      ...fixture,
      docs: { enabled: true, topics: { readme: { text: "# r\n" } } },
    };
    const mcp = cliBuiltinMcpCommand(withDocs);
    expect(mcp.description).toContain("MCP server");
    expect(mcp.notes).toContain("install --mcp --yes");
    expect(mcp.notes).toContain("docs mcp");
  });
});

describe("presentation root", () => {
  test("includes mcp and install when enabled", () => {
    const root = cliPresentationRoot(fixture);
    const keys = root.commands?.map((c) => c.key) ?? [];
    expect(keys).toContain("mcp");
    expect(keys).toContain("install");
    expect(keys).toContain("uninstall");
  });

  test("omits install when install.enabled is false", () => {
    const disabled: CliProgram = { ...fixture, install: { enabled: false } };
    const root = cliPresentationRoot(disabled);
    expect(root.commands?.map((c) => c.key)).not.toContain("install");
  });
  test("includes version builtin", () => {
    const root = cliPresentationRoot(fixture);
    expect(root.commands?.map((c) => c.key)).toContain("version");
  });

  test("root notes include agent hint when docs enabled", () => {
    const withDocs: CliProgram = {
      ...fixture,
      docs: { enabled: true, topics: { readme: { text: "# r\n" } } },
    };
    const root = cliPresentationRoot(withDocs);
    expect(root.notes).toContain("For AI agents: `myapp docs skill`.");
    expect(root.notes).not.toContain("install --skill");
  });
});

describe("completion emitters", () => {
  test("fish script references app key and subcommands", () => {
    const schema = cliPresentationRoot(fixture);
    const fish = completionFishScript(schema);
    expect(fish).toContain("complete -c myapp");
    expect(fish).toContain("hello");
    expect(fish).toContain("install");
  });

  test("bash script includes install flags", () => {
    const schema = cliPresentationRoot(fixture);
    const bash = completionBashScript(schema);
    expect(bash).toContain("--all");
    expect(bash).toContain("install");
  });

  test("zsh script registers compdef", () => {
    const schema = cliPresentationRoot({
      key: "zapp",
      version: "0.0.0",
      description: "z",
      handler: () => {},
    });
    const zsh = completionZshScript(schema);
    expect(zsh).toContain("#compdef zapp");
    expect(zsh).toContain("compdef _zapp zapp");
  });
});

describe("schema export builtins", () => {
  test("exportPresentationBuiltins includes config when appConfig set", () => {
    const withConfig: CliProgram = {
      ...fixture,
      appConfig: {
        entries: {
          apiToken: { description: "Token.", env: "API_TOKEN" },
        },
      },
    };
    const builtins = exportPresentationBuiltins(withConfig);
    expect(builtins.map((b) => b.key)).toContain("config");
  });

  test("exportPresentationBuiltins includes install options", () => {
    const builtins = exportPresentationBuiltins(fixture);
    const install = builtins.find((b) => b.key === "install");
    expect(install?.options?.find((o) => o.name === "all")?.description).toContain("agent");
  });
});
