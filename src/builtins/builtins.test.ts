/*
Tests for builtins/builtins module behavior.
*/

import { describe, expect, test } from "bun:test";
import { resolveCapabilities } from "../capabilities.ts";
import { cliBuiltinDocsGroup } from "../docs/builtin.ts";
import { ParseKind, parse, postParseValidate } from "../parse.ts";
import type { CliProgram } from "../types.ts";
import { cliBuiltinConfigureCommand, configureBuiltinOptions } from "./configure.ts";
import { configureCommandDescription, configureSyncOptionDescription } from "./configure-copy.ts";
import { exportPresentationBuiltins } from "./export.ts";
import { completionBashScript, completionFishScript, completionZshScript } from "./index.ts";
import { cliBuiltinMcpCommand } from "./mcp.ts";
import { cliParseRoot, cliPresentationRoot } from "./presentation.ts";

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

const noMcp: CliProgram = {
  key: "skillonly",
  version: "0.0.0",
  description: "Skills only.",
  commands: [{ key: "ping", description: "Ping.", handler: () => {} }],
};

/** Tests for builtins help copy. */
describe("builtins help copy", () => {
  test("configure command includes Homebrew-oriented description", () => {
    const configure = cliBuiltinConfigureCommand(fixture);
    expect(configure.description).toContain("agent skills");
    expect(configure.description).toContain("MCP config");
    expect(configure.notes).toContain("brew upgrade");
    const names = configureBuiltinOptions(fixture).map((o) => o.name);
    expect(names).toContain("sync");
    expect(names).toContain("remove-all");
    expect(names).toContain("status");
    const yesOpt = configureBuiltinOptions(fixture).find((o) => o.name === "yes");
    expect(yesOpt?.shortName).toBe("y");
  });

  test("configure copy omits MCP when mcpServer unset", () => {
    const caps = resolveCapabilities(noMcp);
    expect(configureCommandDescription(noMcp, caps)).toBe("Set up agent skills for this app (binary via Homebrew).");
    expect(configureCommandDescription(noMcp, caps)).not.toContain("MCP");
    expect(configureSyncOptionDescription(noMcp, caps)).not.toContain("MCP");
    const configure = cliBuiltinConfigureCommand(noMcp);
    expect(configure.description).not.toContain("MCP");
  });

  /** Configure notes mention brew upgrade and interactive configure. */
  test("configure notes mention brew upgrade and interactive configure", () => {
    const configure = cliBuiltinConfigureCommand(fixture);
    expect(configure.notes).toContain("brew upgrade");
    expect(configure.notes).toContain("configure --sync --yes");
    expect(configure.notes).toContain(`${fixture.key} configure`);

    const withConfig: CliProgram = {
      ...fixture,
      appConfig: {
        entries: { token: { description: "Token.", env: "TOKEN" } },
      },
    };
    expect(configureBuiltinOptions(withConfig).map((o) => o.name)).toContain("remove-config");
  });

  test("configure -y parses as --yes", () => {
    const root = cliParseRoot(fixture);
    const pr = postParseValidate(root, parse(root, ["configure", "-y", "--sync"]));
    expect(pr.kind).toBe(ParseKind.Ok);
    if (pr.kind === ParseKind.Ok) {
      expect(pr.opts.yes).toBe("1");
      expect(pr.opts.sync).toBe("1");
    }
  });

  test("mcp builtin description is user-facing", () => {
    const withDocs: CliProgram = {
      ...fixture,
      docs: { enabled: true, topics: { readme: { text: "# r\n" } } },
    };
    const mcp = cliBuiltinMcpCommand(withDocs);
    expect(mcp.description).toContain("MCP server");
    expect(mcp.notes).toContain("configure");
    expect(mcp.notes).toContain("docs mcp");
  });
});

/** Tests for presentation root. */
describe("presentation root", () => {
  test("includes mcp and configure when enabled", () => {
    const root = cliPresentationRoot(fixture);
    const keys = root.commands?.map((c) => c.key) ?? [];
    expect(keys).toContain("mcp");
    expect(keys).toContain("configure");
    expect(keys).not.toContain("completion");
    expect(keys).not.toContain("install");
  });

  test("omits configure when configure.enabled is false", () => {
    const disabled: CliProgram = { ...fixture, configure: { enabled: false } };
    const root = cliPresentationRoot(disabled);
    expect(root.commands?.map((c) => c.key)).not.toContain("configure");
  });

  test("includes version builtin", () => {
    const root = cliPresentationRoot(fixture);
    expect(root.commands?.map((c) => c.key)).toContain("version");
  });
});

/** Tests for completion emitters. */
describe("completion emitters", () => {
  test("fish script references app key and subcommands", () => {
    const schema = cliPresentationRoot(fixture);
    const fish = completionFishScript(schema);
    expect(fish).toContain("complete -c myapp");
    expect(fish).toContain("hello");
    expect(fish).toContain("configure");
  });

  test("bash script includes configure flags", () => {
    const schema = cliPresentationRoot(fixture);
    const bash = completionBashScript(schema);
    expect(bash).toContain("hello");
    expect(bash).toContain("--sync");
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

/** Tests for schema export builtins. */
describe("schema export builtins", () => {
  /** ExportPresentationBuiltins nests configure get/set when appConfig set. */
  test("exportPresentationBuiltins nests configure get/set when appConfig set", () => {
    const withConfig: CliProgram = {
      ...fixture,
      appConfig: {
        entries: {
          apiToken: { description: "Token.", env: "API_TOKEN" },
        },
      },
    };
    const builtins = exportPresentationBuiltins(withConfig);
    expect(builtins.map((b) => b.key)).toContain("configure");
    expect(builtins.map((b) => b.key)).not.toContain("config");
    const configureNode = builtins.find((b) => b.key === "configure");
    expect(configureNode && "commands" in configureNode).toBe(true);
    if (configureNode && "commands" in configureNode) {
      const keys = configureNode.commands?.map((c) => c.key) ?? [];
      expect(keys).toEqual(expect.arrayContaining(["get", "set"]));
    }
  });

  test("exportPresentationBuiltins omits hidden completion", () => {
    const builtins = exportPresentationBuiltins(fixture);
    expect(builtins.map((b) => b.key)).not.toContain("completion");
  });
});

/** Tests for docs skill topic copy. */
describe("docs skill topic copy", () => {
  /** Tests that mentions configure when configure is enabled. */
  test("mentions configure when configure is enabled", () => {
    const withDocs: CliProgram = {
      ...noMcp,
      docs: { enabled: true, topics: { readme: { text: "# r\n" } } },
    };
    const skill = cliBuiltinDocsGroup(withDocs).commands.find((c) => c.key === "skill");
    expect(skill?.description).toContain("configure");

    const configureOff: CliProgram = {
      ...withDocs,
      configure: { enabled: false },
    };
    const skillOff = cliBuiltinDocsGroup(configureOff).commands.find((c) => c.key === "skill");
    expect(skillOff?.description).not.toContain("configure");
  });
});
