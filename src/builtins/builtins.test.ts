import { describe, expect, test } from "bun:test";
import { cliBuiltinInstallCommand, installBuiltinOptions } from "./install.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliPresentationRoot } from "./presentation.ts";
import { completionBashScript, completionFishScript, completionZshScript } from "./index.ts";
import { exportPresentationBuiltins } from "./export.ts";
import { CliProgram } from "../types.ts";

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
  test("install command includes description and option text", () => {
    const install = cliBuiltinInstallCommand(fixture);
    expect(install.description).toContain("Install the binary");
    expect(install.notes).toContain("install --all");
    const names = installBuiltinOptions(fixture).map((o) => o.name);
    expect(names).toContain("all");
    expect(names).toContain("mcp");
    expect(names).toContain("prefix");
  });

  test("install omits --mcp option when mcpServer unset", () => {
    const noMcp: CliProgram = { key: "x", version: "0.0.0", description: "x", handler: () => {} };
    const names = installBuiltinOptions(noMcp).map((o) => o.name);
    expect(names).not.toContain("mcp");
  });

  test("install omits --update when updateGetLatest unset", () => {
    const install = cliBuiltinInstallCommand(fixture);
    expect(installBuiltinOptions(fixture).map((o) => o.name)).not.toContain("update");
    expect(install.notes).not.toContain("Upgrade to latest release");
    expect(install.notes).toContain("Refresh after upgrading");
  });

  test("install notes include upgrade section when updateGetLatest is set", () => {
    const withUpdate: CliProgram = {
      ...fixture,
      install: { updateGetLatest: async () => ({ path: process.execPath }) },
    };
    const install = cliBuiltinInstallCommand(withUpdate);
    const notes = install.notes ?? "";
    expect(installBuiltinOptions(withUpdate).map((o) => o.name)).toContain("update");
    expect(notes).toContain("Upgrade to latest release");
    expect(notes.indexOf("install --reinstall")).toBeLessThan(notes.indexOf("install --update"));
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
    const schema = cliPresentationRoot({ key: "zapp", version: "0.0.0", description: "z", handler: () => {} });
    const zsh = completionZshScript(schema);
    expect(zsh).toContain("#compdef zapp");
    expect(zsh).toContain("compdef _zapp zapp");
  });
});

describe("schema export builtins", () => {
  test("exportPresentationBuiltins includes install options", () => {
    const builtins = exportPresentationBuiltins(fixture);
    const install = builtins.find((b) => b.key === "install");
    expect(install?.options?.find((o) => o.name === "all")?.description).toContain("binary");
  });
});
