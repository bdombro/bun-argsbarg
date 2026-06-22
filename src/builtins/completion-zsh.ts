import { CliOptionKind, type CliRouter } from "../types.ts";
import { collectScopes, type ScopeRec } from "./scopes.ts";
import {
  escShellSingleQuoted,
  identToken,
  kHelpLong,
  kHelpShort,
  mainName,
} from "./shell-helpers.ts";

function emitScopeArraysZsh(ident: string, scopes: ScopeRec[]): string {
  let out = "";
  for (const [i, sc] of scopes.entries()) {
    out += `typeset -g A_${ident}_${i}_opts\n`;
    out += `A_${ident}_${i}_opts=(`;
    out +=
      "'" +
      escShellSingleQuoted(kHelpLong) +
      ":" +
      escShellSingleQuoted("Show help for this command.") +
      "' '" +
      escShellSingleQuoted(kHelpShort) +
      ":" +
      escShellSingleQuoted("Show help for this command.") +
      "'";
    for (const o of sc.opts) {
      out +=
        " '" +
        escShellSingleQuoted(`--${o.name}`) +
        ":" +
        escShellSingleQuoted(o.description) +
        "'";
      if (o.shortName) {
        out +=
          " '" +
          escShellSingleQuoted(`-${o.shortName}`) +
          ":" +
          escShellSingleQuoted(o.description) +
          "'";
      }
    }
    out += ")\n";
    out += `typeset -g A_${ident}_${i}_leaf=${sc.kids.length === 0 ? "1" : "0"}\n`;
    out += `typeset -g A_${ident}_${i}_pos=${sc.wantsFiles ? "1" : "0"}\n`;
    if (sc.kids.length > 0) {
      out += `typeset -g A_${ident}_${i}_cmds=(`;
      for (const ch of sc.kids) {
        out += ` '${escShellSingleQuoted(ch.key)}:${escShellSingleQuoted(ch.description)}'`;
      }
      out += ")\n";
    }
  }
  return out;
}

function emitConsumeLongZsh(ident: string, scopes: ScopeRec[]): string {
  let o = "_${ident}_nac_consume_long() {\n".replace("${ident}", ident);
  o += '  local sid="$1" w="$2" nw="$3"\n';
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    o += `    ${i})\n`;
    o += "      case $w in\n";
    o +=
      "        " +
      kHelpLong +
      "|${kHelpLong}=*|${kHelpShort}) echo 1 ;;\n"
        .replace(/\$\{kHelpLong\}/g, kHelpLong)
        .replace(/\$\{kHelpShort\}/g, kHelpShort);
    for (const op of sc.opts) {
      const base = `--${op.name}`;
      if (op.kind === "presence") {
        o += `        ${base}${"|${base}=*) echo 1 ;;\n".replace(/\$\{base\}/g, base)}`;
      } else {
        o += `        ${base}=*) echo 1 ;;\n`;
        o += `        ${base}) echo 2 ;;\n`;
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
  o += '  local sid="$1" w="$2"\n';
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    o += `    ${i})\n`;
    o += "      local rest=${w#-}\n";
    o += "      local ch\n";
    o += "      local saw=0\n";
    o += "      while [[ -n $rest ]]; do\n";
    o += "        ch=${rest[1,1]}\n";
    o += "        rest=${rest[2,-1]}\n";
    o += "        case $ch in\n";
    let boolChars = "";
    for (const op of sc.opts) {
      if (!op.shortName) continue;
      if (op.kind === "presence") {
        boolChars += `${op.shortName}|`;
      } else {
        o += `          ${op.shortName})\n`;
        o += "            if [[ $saw -ne 0 || -n $rest ]]; then echo 0; return; fi\n";
        o += "            echo 2; return ;;\n";
      }
    }
    if (boolChars.length > 0) {
      boolChars = boolChars.slice(0, -1);
      o += `          ${boolChars}) ;;\n`;
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

function emitMatchChildZsh(
  ident: string,
  scopes: ScopeRec[],
  pathIndex: Record<string, number>,
): string {
  let o = "_${ident}_nac_match_child() {\n".replace("${ident}", ident);
  o += '  local sid="$1" w="$2"\n';
  o += "  case $sid in\n";
  for (const [sid, sc] of scopes.entries()) {
    if (sc.kids.length === 0) continue;
    o += `    ${sid})\n`;
    o += "      case $w in\n";
    for (const ch of sc.kids) {
      const childPath = sc.path === "" ? ch.key : `${sc.path}/${ch.key}`;
      const cid = pathIndex[childPath] ?? 0;
      o += `        ${ch.key}) echo ${cid}; return 0 ;;\n`;
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
  o += `    if [[ $w == ${kHelpShort} || $w == ${kHelpLong} ]]; then\n`;
  o += "      ((i++)); continue\n";
  o += "    fi\n";
  o += "    if [[ $w == --* ]]; then\n";
  o += '      steps=$(_${ident}_nac_consume_long "$sid" "$w" "${words[i+1]}")\n'.replace(
    "${ident}",
    ident,
  );
  o += "      case $steps in\n";
  o += "        0) break ;;\n";
  o += "        1) ((i++)) ;;\n";
  o += "        2) ((i+=2)) ;;\n";
  o += "        *) break ;;\n";
  o += "      esac\n";
  o += "      continue\n";
  o += "    fi\n";
  o += "    if [[ $w == -* ]]; then\n";
  o += '      steps=$(_${ident}_nac_consume_short "$sid" "$w")\n'.replace("${ident}", ident);
  o += "      case $steps in\n";
  o += "        0) break ;;\n";
  o += "        1) ((i++)) ;;\n";
  o += "        2) ((i++)); break ;;\n";
  o += "        *) break ;;\n";
  o += "      esac\n";
  o += "      continue\n";
  o += "    fi\n";
  o += '    next=$(_${ident}_nac_match_child "$sid" "$w") || break\n'.replace("${ident}", ident);
  o += "    sid=$next\n";
  o += "    ((i++))\n";
  o += "  done\n";
  o += "  REPLY_SID=$sid\n";
  o += "}\n";
  return o;
}

function emitEnumReplyZsh(ident: string, scopes: ScopeRec[]): string {
  let o = "_${ident}_nac_enum_reply() {\n".replace("${ident}", ident);
  o += "  local sid=$1 prev=$2\n";
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    const enumOpts = sc.opts.filter(
      (op) => op.kind === CliOptionKind.Enum && (op.choices?.length ?? 0) > 0,
    );
    if (enumOpts.length === 0) continue;
    o += `    ${i})\n`;
    o += "      case $prev in\n";
    for (const op of enumOpts) {
      const vals = (op.choices ?? []).map((c) => escShellSingleQuoted(c)).join(" ");
      o += `        --${op.name}) _values ${vals}; return 0 ;;\n`;
    }
    o += "      esac\n";
    o += "      ;;\n";
  }
  o += "  esac\n";
  o += "  return 1\n";
  o += "}\n";
  return o;
}

function emitMainBodyZsh(schema: CliRouter, ident: string): string {
  const main = mainName(schema.key);
  let o = "_${main}() {\n".replace("${main}", main);
  o += '  local curcontext="$curcontext" ret=1\n';
  o += "  _${ident}_nac_simulate\n".replace("${ident}", ident);
  o += "  local sid=$REPLY_SID\n";
  o += '  if _${ident}_nac_enum_reply "$sid" "$words[CURRENT-1]"; then return 0; fi\n'.replace(
    "${ident}",
    ident,
  );
  o += "  if [[ $PREFIX == -* ]]; then\n";
  o += "    local -a optsarr\n";
  o += '    local oname="A_${ident}_${sid}_opts"\n'.replace("${ident}", ident);
  o += "    optsarr=(${(@P)oname})\n";
  o += "    _describe -t options 'option' optsarr && ret=0\n";
  o += "  else\n";
  o += '    local lname="A_${ident}_${sid}_leaf"\n'.replace("${ident}", ident);
  o += "    if [[ ${(P)lname} -eq 0 ]]; then\n";
  o += "      local -a cmdsarr\n";
  o += '      local cname="A_${ident}_${sid}_cmds"\n'.replace("${ident}", ident);
  o += "      cmdsarr=(${(@P)cname})\n";
  o += "      _describe -t commands 'command' cmdsarr && ret=0\n";
  o += "    else\n";
  o += '      local pname="A_${ident}_${sid}_pos"\n'.replace("${ident}", ident);
  o += "      if [[ ${(P)pname} -eq 1 ]]; then\n";
  o += "        _files && ret=0\n";
  o += "      fi\n";
  o += "    fi\n";
  o += "  fi\n";
  o += "  return ret\n";
  o += "}\n\n";
  o += "compdef _${main} ${schema.key}\n"
    .replace("${main}", main)
    .replace("${schema.key}", schema.key);
  return o;
}

/** Returns a self-contained zsh completion script for the given program schema. */
export function completionZshScript(schema: CliRouter): string {
  const ident = identToken(schema.key);
  const scopes = collectScopes(schema);
  const pathIndex: Record<string, number> = {};
  for (const [i, s] of scopes.entries()) {
    pathIndex[s.path] = i;
  }

  let out = `#compdef ${schema.key}\n\n`;
  out += emitScopeArraysZsh(ident, scopes);
  out += emitConsumeLongZsh(ident, scopes);
  out += emitConsumeShortZsh(ident, scopes);
  out += emitMatchChildZsh(ident, scopes, pathIndex);
  out += emitSimulateZsh(ident);
  out += emitEnumReplyZsh(ident, scopes);
  out += emitMainBodyZsh(schema, ident);
  return out;
}
