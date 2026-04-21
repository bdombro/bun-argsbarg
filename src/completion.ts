/*

This file walks the CLI tree into scopes and emits bash and zsh completion scripts.
It builds the shell-side candidate lists, simulates argv state, and chooses the right
items for each completion context.

It keeps completion aligned with the runtime schema so the generated commands,
options, and descriptions stay in sync with the CLI definition.
*/

import { CliCommand, CliOptionDef } from "./types.ts";

// ── Shared Types ───────────────────────────────────────────────────────────────

interface ScopeRec {
  kids: CliCommand[];
  opts: CliOptionDef[];
  path: string;
  wantsFiles: boolean;
}

function hasPositionalArguments(cmd: CliCommand): boolean {
  return (cmd.positionals ?? []).some((p) => p.positional);
}

function walkScopes(cmdPath: string, cmd: CliCommand, acc: ScopeRec[]): void {
  acc.push({
    kids: cmd.children ?? [],
    opts: cmd.options ?? [],
    path: cmdPath,
    wantsFiles: hasPositionalArguments(cmd),
  });
  for (const ch of cmd.children ?? []) {
    const nextPath = cmdPath === "" ? ch.key : cmdPath + "/" + ch.key;
    walkScopes(nextPath, ch, acc);
  }
}

function collectScopes(schema: CliCommand): ScopeRec[] {
  const acc: ScopeRec[] = [];
  acc.push({
    kids: schema.children ?? [],
    opts: schema.options ?? [],
    path: "",
    wantsFiles: false,
  });
  for (const c of schema.children ?? []) {
    walkScopes(c.key, c, acc);
  }
  return acc;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function identToken(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

function escShellSingleQuoted(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function mainName(schemaName: string): string {
  return schemaName.replace(/[^a-zA-Z0-9]/g, "_");
}

const kHelpLong = "--help";
const kHelpShort = "-h";

// ── Bash Completion ────────────────────────────────────────────────────────────

function emitConsumeLong(ident: string, scopes: ScopeRec[]): string {
  let o = "_${ident}_nac_consume_long() {\n".replace("${ident}", ident);
  o += "  local sid=\"$1\" w=\"$2\" nw=\"$3\"\n";
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    o += "    " + i + ")\n";
    o += "      case $w in\n";
    o += "        " + kHelpLong + "|${kHelpLong}=*|${kHelpShort}) echo 1 ;;\n".replace(/\$\{kHelpLong\}/g, kHelpLong).replace(/\$\{kHelpShort\}/g, kHelpShort);
    for (const op of sc.opts) {
      if (op.positional) continue;
      const base = "--" + op.name;
      if (op.kind === "presence") {
        o += "        " + base + "|${base}=*) echo 1 ;;\n".replace(/\$\{base\}/g, base);
      } else {
        o += "        " + base + "=*) echo 1 ;;\n";
        o += "        " + base + ") echo 2 ;;\n";
      }
    }
    o += "        *) echo 0 ;;\n";
    o += "      esac\n";
    o += "      ;;\n";
  }
  o += "    *) echo 0 ;;\n";
  o += "  esac\n";
  o += "}\n";
  return o;
}

function emitConsumeShort(ident: string, scopes: ScopeRec[]): string {
  let o = "_${ident}_nac_consume_short() {\n".replace("${ident}", ident);
  o += "  local sid=\"$1\" w=\"$2\"\n";
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    o += "    " + i + ")\n";
    o += "      local rest=${w#-}\n";
    o += "      local ch\n";
    o += "      local saw=0\n";
    o += "      while [[ -n $rest ]]; do\n";
    o += "        ch=${rest:0:1}\n";
    o += "        rest=${rest:1}\n";
    o += "        case $ch in\n";
    let boolChars = "";
    for (const op of sc.opts) {
      if (op.positional) continue;
      if (!op.shortName) continue;
      if (op.kind === "presence") {
        boolChars += op.shortName + "|";
      } else {
        o += "          " + op.shortName + ")\n";
        o += "            if [[ $saw -ne 0 || -n $rest ]]; then echo 0; return; fi\n";
        o += "            echo 2; return ;;\n";
      }
    }
    if (boolChars.length > 0) {
      boolChars = boolChars.slice(0, -1);
      o += "          " + boolChars + ") ;;\n";
    }
    o += "          *) echo 0; return ;;\n";
    o += "        esac\n";
    o += "        saw=1\n";
    o += "      done\n";
    o += "      echo 1\n";
    o += "      ;;\n";
  }
  o += "    *) echo 0 ;;\n";
  o += "  esac\n";
  o += "}\n";
  return o;
}

function emitMatchChild(ident: string, scopes: ScopeRec[], pathIndex: Record<string, number>): string {
  let o = "_${ident}_nac_match_child() {\n".replace("${ident}", ident);
  o += "  local sid=\"$1\" w=\"$2\"\n";
  o += "  case $sid in\n";
  for (const [sid, sc] of scopes.entries()) {
    if (sc.kids.length === 0) continue;
    o += "    " + sid + ")\n";
    o += "      case $w in\n";
    for (const ch of sc.kids) {
      const childPath = sc.path === "" ? ch.key : sc.path + "/" + ch.key;
      const cid = pathIndex[childPath] ?? 0;
      o += "        " + ch.key + ") echo " + cid + "; return 0 ;;\n";
    }
    o += "      esac\n";
    o += "      ;;\n";
  }
  o += "  esac\n";
  o += "  return 1\n";
  o += "}\n";
  return o;
}

function emitSimulate(ident: string): string {
  let o = "_${ident}_nac_simulate() {\n".replace("${ident}", ident);
  o += "  local i=1 sid=0 w steps next\n";
  o += "  while (( i < COMP_CWORD )); do\n";
  o += "    w=\"${COMP_WORDS[i]}\"\n";
  o += "    if [[ $w == " + kHelpShort + " || $w == " + kHelpLong + " ]]; then\n";
  o += "      ((i++)); continue\n";
  o += "    fi\n";
  o += "    if [[ $w == --* ]]; then\n";
  o += "      steps=$(_${ident}_nac_consume_long \"$sid\" \"$w\" \"${COMP_WORDS[i+1]}\")\n".replace("${ident}", ident);
  o += "      case $steps in\n";
  o += "        0) break ;;\n";
  o += "        1) ((i++)) ;;\n";
  o += "        2) ((i+=2)) ;;\n";
  o += "        *) break ;;\n";
  o += "      esac\n";
  o += "      continue\n";
  o += "    fi\n";
  o += "    if [[ $w == -* ]]; then\n";
  o += "      steps=$(_${ident}_nac_consume_short \"$sid\" \"$w\")\n".replace("${ident}", ident);
  o += "      case $steps in\n";
  o += "        0) break ;;\n";
  o += "        1) ((i++)) ;;\n";
  o += "        2) ((i++)); break ;;\n";
  o += "        *) break ;;\n";
  o += "      esac\n";
  o += "      continue\n";
  o += "    fi\n";
  o += "    next=$(_${ident}_nac_match_child \"$sid\" \"$w\") || break\n".replace("${ident}", ident);
  o += "    sid=$next\n";
  o += "    ((i++))\n";
  o += "  done\n";
  o += "  REPLY_SID=$sid\n";
  o += "}\n";
  return o;
}

function emitMainBodyBash(schema: CliCommand, ident: string): string {
  const main = mainName(schema.key);
  let o = "_${main}() {\n".replace("${main}", main);
  o += "  local cur=\"${COMP_WORDS[COMP_CWORD]}\"\n";
  o += "  local prev=\"${COMP_WORDS[COMP_CWORD-1]:-}\"\n";
  o += "  _${ident}_nac_simulate\n".replace("${ident}", ident);
  o += "  local sid=$REPLY_SID\n";
  o += "  if [[ $cur == -* ]]; then\n";
  o += "    local oname=\"A_${ident}_${sid}_opts\"\n".replace("${ident}", ident);
  o += "    local -a optsarr\n";
  o += "    local -n optsref=\"$oname\"\n";
  o += "    COMPREPLY=( $(compgen -W \"${optsref[*]}\" -- \"$cur\") )\n";
  o += "  else\n";
  o += "    local lname=\"A_${ident}_${sid}_leaf\"\n".replace("${ident}", ident);
  o += "    local -n leafref=\"$lname\"\n";
  o += "    if [[ $leafref -eq 0 ]]; then\n";
  o += "      local cname=\"A_${ident}_${sid}_cmds\"\n".replace("${ident}", ident);
  o += "      local -a cmdsarr\n";
  o += "      local -n cmdsref=\"$cname\"\n";
  o += "      COMPREPLY=( $(compgen -W \"${cmdsref[*]}\" -- \"$cur\") )\n";
  o += "    else\n";
  o += "      local pname=\"A_${ident}_${sid}_pos\"\n".replace("${ident}", ident);
  o += "      local -n posref=\"$pname\"\n";
  o += "      if [[ $posref -eq 1 ]]; then\n";
  o += "        compopt -o filenames\n";
  o += "      fi\n";
  o += "    fi\n";
  o += "  fi\n";
  o += "}\n\n";
  o += "complete -F _${main} ${schema.key}\n".replace("${main}", main).replace("${schema.key}", schema.key);
  return o;
}

export function completionBashScript(schema: CliCommand): string {
  const ident = identToken(schema.key);
  const scopes = collectScopes(schema);
  let pathIndex: Record<string, number> = {};
  for (const [i, s] of scopes.entries()) {
    pathIndex[s.path] = i;
  }

  let out = "# Generated bash completion for " + schema.key + ".\n\n";

  // Emit scope arrays
  for (const [i, sc] of scopes.entries()) {
    out += "A_" + ident + "_" + i + "_opts=()\n";
    out += "A_" + ident + "_" + i + "_opts+=('" + kHelpLong + "' '" + kHelpShort + "')\n";
    for (const o of sc.opts) {
      if (o.positional) continue;
      out += "A_" + ident + "_" + i + "_opts+=('--" + o.name + "')\n";
      if (o.shortName) {
        out += "A_" + ident + "_" + i + "_opts+=('-" + o.shortName + "')\n";
      }
    }
    out += "A_" + ident + "_" + i + "_leaf=" + (sc.kids.length === 0 ? "1" : "0") + "\n";
    out += "A_" + ident + "_" + i + "_pos=" + (sc.wantsFiles ? "1" : "0") + "\n";
    if (sc.kids.length > 0) {
      out += "A_" + ident + "_" + i + "_cmds=(";
      for (const ch of sc.kids) {
        out += " '" + ch.key + "'";
      }
      out += ")\n";
    }
  }

  out += emitConsumeLong(ident, scopes);
  out += emitConsumeShort(ident, scopes);
  out += emitMatchChild(ident, scopes, pathIndex);
  out += emitSimulate(ident);
  out += emitMainBodyBash(schema, ident);

  return out;
}

// ── Zsh Completion ─────────────────────────────────────────────────────────────

function emitScopeArraysZsh(ident: string, scopes: ScopeRec[]): string {
  let out = "";
  for (const [i, sc] of scopes.entries()) {
    out += "typeset -g A_" + ident + "_" + i + "_opts\n";
    out += "A_" + ident + "_" + i + "_opts=(";
    out += "'" + escShellSingleQuoted(kHelpLong) + ":" + escShellSingleQuoted("Show help for this command.") + "' '" + escShellSingleQuoted(kHelpShort) + ":" + escShellSingleQuoted("Show help for this command.") + "'";
    for (const o of sc.opts) {
      out += " '" + escShellSingleQuoted("--" + o.name) + ":" + escShellSingleQuoted(o.description) + "'";
      if (o.shortName) {
        out += " '" + escShellSingleQuoted("-" + o.shortName) + ":" + escShellSingleQuoted(o.description) + "'";
      }
    }
    out += ")\n";
    out += "typeset -g A_" + ident + "_" + i + "_leaf=" + (sc.kids.length === 0 ? "1" : "0") + "\n";
    out += "typeset -g A_" + ident + "_" + i + "_pos=" + (sc.wantsFiles ? "1" : "0") + "\n";
    if (sc.kids.length > 0) {
      out += "typeset -g A_" + ident + "_" + i + "_cmds=(";
      for (const ch of sc.kids) {
        out +=
          " '" +
          escShellSingleQuoted(ch.key) +
          ":" +
          escShellSingleQuoted(ch.description) +
          "'";
      }
      out += ")\n";
    }
  }
  return out;
}

function emitConsumeLongZsh(ident: string, scopes: ScopeRec[]): string {
  let o = "_${ident}_nac_consume_long() {\n".replace("${ident}", ident);
  o += "  local sid=\"$1\" w=\"$2\" nw=\"$3\"\n";
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    o += "    " + i + ")\n";
    o += "      case $w in\n";
    o += "        " + kHelpLong + "|${kHelpLong}=*|${kHelpShort}) echo 1 ;;\n".replace(/\$\{kHelpLong\}/g, kHelpLong).replace(/\$\{kHelpShort\}/g, kHelpShort);
    for (const op of sc.opts) {
      if (op.positional) continue;
      const base = "--" + op.name;
      if (op.kind === "presence") {
        o += "        " + base + "|${base}=*) echo 1 ;;\n".replace(/\$\{base\}/g, base);
      } else {
        o += "        " + base + "=*) echo 1 ;;\n";
        o += "        " + base + ") echo 2 ;;\n";
      }
    }
    o += "        *) echo 0 ;;\n";
    o += "      esac\n";
    o += "      ;;\n";
  }
  o += "    *) echo 0 ;;\n";
  o += "  esac\n";
  o += "}\n";
  return o;
}

function emitConsumeShortZsh(ident: string, scopes: ScopeRec[]): string {
  let o = "_${ident}_nac_consume_short() {\n".replace("${ident}", ident);
  o += "  local sid=\"$1\" w=\"$2\"\n";
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    o += "    " + i + ")\n";
    o += "      local rest=${w#-}\n";
    o += "      local ch\n";
    o += "      local saw=0\n";
    o += "      while [[ -n $rest ]]; do\n";
    o += "        ch=${rest[1,1]}\n";
    o += "        rest=${rest[2,-1]}\n";
    o += "        case $ch in\n";
    let boolChars = "";
    for (const op of sc.opts) {
      if (op.positional) continue;
      if (!op.shortName) continue;
      if (op.kind === "presence") {
        boolChars += op.shortName + "|";
      } else {
        o += "          " + op.shortName + ")\n";
        o += "            if [[ $saw -ne 0 || -n $rest ]]; then echo 0; return; fi\n";
        o += "            echo 2; return ;;\n";
      }
    }
    if (boolChars.length > 0) {
      boolChars = boolChars.slice(0, -1);
      o += "          " + boolChars + ") ;;\n";
    }
    o += "          *) echo 0; return ;;\n";
    o += "        esac\n";
    o += "        saw=1\n";
    o += "      done\n";
    o += "      echo 1\n";
    o += "      ;;\n";
  }
  o += "    *) echo 0 ;;\n";
  o += "  esac\n";
  o += "}\n";
  return o;
}

function emitMatchChildZsh(ident: string, scopes: ScopeRec[], pathIndex: Record<string, number>): string {
  let o = "_${ident}_nac_match_child() {\n".replace("${ident}", ident);
  o += "  local sid=\"$1\" w=\"$2\"\n";
  o += "  case $sid in\n";
  for (const [sid, sc] of scopes.entries()) {
    if (sc.kids.length === 0) continue;
    o += "    " + sid + ")\n";
    o += "      case $w in\n";
    for (const ch of sc.kids) {
      const childPath = sc.path === "" ? ch.key : sc.path + "/" + ch.key;
      const cid = pathIndex[childPath] ?? 0;
      o += "        " + ch.key + ") echo " + cid + "; return 0 ;;\n";
    }
    o += "      esac\n";
    o += "      ;;\n";
  }
  o += "  esac\n";
  o += "  return 1\n";
  o += "}\n";
  return o;
}

function emitSimulateZsh(ident: string): string {
  let o = "_${ident}_nac_simulate() {\n".replace("${ident}", ident);
  o += "  local i=2 sid=0 w steps next\n";
  o += "  while (( i < CURRENT )); do\n";
  o += "    w=$words[i]\n";
  o += "    if [[ $w == " + kHelpShort + " || $w == " + kHelpLong + " ]]; then\n";
  o += "      ((i++)); continue\n";
  o += "    fi\n";
  o += "    if [[ $w == --* ]]; then\n";
  o += "      steps=$(_${ident}_nac_consume_long \"$sid\" \"$w\" \"${words[i+1]}\")\n".replace("${ident}", ident);
  o += "      case $steps in\n";
  o += "        0) break ;;\n";
  o += "        1) ((i++)) ;;\n";
  o += "        2) ((i+=2)) ;;\n";
  o += "        *) break ;;\n";
  o += "      esac\n";
  o += "      continue\n";
  o += "    fi\n";
  o += "    if [[ $w == -* ]]; then\n";
  o += "      steps=$(_${ident}_nac_consume_short \"$sid\" \"$w\")\n".replace("${ident}", ident);
  o += "      case $steps in\n";
  o += "        0) break ;;\n";
  o += "        1) ((i++)) ;;\n";
  o += "        2) ((i++)); break ;;\n";
  o += "        *) break ;;\n";
  o += "      esac\n";
  o += "      continue\n";
  o += "    fi\n";
  o += "    next=$(_${ident}_nac_match_child \"$sid\" \"$w\") || break\n".replace("${ident}", ident);
  o += "    sid=$next\n";
  o += "    ((i++))\n";
  o += "  done\n";
  o += "  REPLY_SID=$sid\n";
  o += "}\n";
  return o;
}

function emitMainBodyZsh(schema: CliCommand, ident: string): string {
  const main = mainName(schema.key);
  let o = "_${main}() {\n".replace("${main}", main);
  o += "  local curcontext=\"$curcontext\" ret=1\n";
  o += "  _${ident}_nac_simulate\n".replace("${ident}", ident);
  o += "  local sid=$REPLY_SID\n";
  o += "  if [[ $PREFIX == -* ]]; then\n";
  o += "    local -a optsarr\n";
  o += "    local oname=\"A_${ident}_${sid}_opts\"\n".replace("${ident}", ident);
  o += "    optsarr=(${(@P)oname})\n";
  o += "    _describe -t options 'option' optsarr && ret=0\n";
  o += "  else\n";
  o += "    local lname=\"A_${ident}_${sid}_leaf\"\n".replace("${ident}", ident);
  o += "    if [[ ${(P)lname} -eq 0 ]]; then\n";
  o += "      local -a cmdsarr\n";
  o += "      local cname=\"A_${ident}_${sid}_cmds\"\n".replace("${ident}", ident);
  o += "      cmdsarr=(${(@P)cname})\n";
  o += "      _describe -t commands 'command' cmdsarr && ret=0\n";
  o += "    else\n";
  o += "      local pname=\"A_${ident}_${sid}_pos\"\n".replace("${ident}", ident);
  o += "      if [[ ${(P)pname} -eq 1 ]]; then\n";
  o += "        _files && ret=0\n";
  o += "      fi\n";
  o += "    fi\n";
  o += "  fi\n";
  o += "  return ret\n";
  o += "}\n\n";
  o += "compdef _${main} ${schema.key}\n".replace("${main}", main).replace("${schema.key}", schema.key);
  return o;
}

export function completionZshScript(schema: CliCommand): string {
  const ident = identToken(schema.key);
  const scopes = collectScopes(schema);
  let pathIndex: Record<string, number> = {};
  for (const [i, s] of scopes.entries()) {
    pathIndex[s.path] = i;
  }

  let out = "#compdef " + schema.key + "\n\n";
  out += emitScopeArraysZsh(ident, scopes);
  out += emitConsumeLongZsh(ident, scopes);
  out += emitConsumeShortZsh(ident, scopes);
  out += emitMatchChildZsh(ident, scopes, pathIndex);
  out += emitSimulateZsh(ident);
  out += emitMainBodyZsh(schema, ident);
  return out;
}

/**
 * Builds the static `completion` / `bash` / `zsh` subtree used for shell integration.
 */
export function cliBuiltinCompletionGroup(appName: string): CliCommand {
  return {
    key: "completion",
    description: "Generate the autocompletion script for shells.",
    children: [
      {
        key: "bash",
        description: "Print a bash tab-completion script.",
        notes:
          "Output is the whole script.\n" +
          "Pipe it to a file, or feed it straight into your shell.\n\n" +
          "To keep it across restarts, save it and source that file from ~/.bashrc.\n\n" +
          "For example:\n\n" +
          `echo 'eval \"$(${appName} completion bash)\"' >> ~/.bashrc\n` +
          `\nor\n` +
          `  ${appName} completion bash > ~/.bash_completion.d/${appName}\n` +
          `  echo 'source ~/.bash_completion.d/${appName}' >> ~/.bashrc\n\n` +
          "To try it only in this session (nothing written to disk):\n" +
          `  source <(${appName} completion bash)`,
        handler: () => {},
      },
      {
        key: "zsh",
        description: "Print a zsh tab-completion script.",
        notes:
          "Output is the whole script.\n\n" +
          `fpath setup: ${appName} completion zsh > ~/.zsh/completions/_${appName}\n\n` +
          `source setup: echo 'eval \"$(${appName} completion zsh)\"' >> ~/.zshrc\n\n` +
          "To try it only in this session (nothing written to disk):\n" +
          `  eval \"$(${appName} completion zsh)\"`,
        handler: () => {},
      },
    ],
  };
}
