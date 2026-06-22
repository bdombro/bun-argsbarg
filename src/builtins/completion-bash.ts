import { CliOptionKind, type CliRouter } from "../types.ts";
import { collectScopes, type ScopeRec } from "./scopes.ts";
import {
  escShellSingleQuoted,
  identToken,
  kHelpLong,
  kHelpShort,
  mainName,
} from "./shell-helpers.ts";

function emitConsumeLong(ident: string, scopes: ScopeRec[]): string {
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

function emitConsumeShort(ident: string, scopes: ScopeRec[]): string {
  let o = "_${ident}_nac_consume_short() {\n".replace("${ident}", ident);
  o += '  local sid="$1" w="$2"\n';
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    o += `    ${i})\n`;
    o += "      local rest=${w#-}\n";
    o += "      local ch\n";
    o += "      local saw=0\n";
    o += "      while [[ -n $rest ]]; do\n";
    o += "        ch=${rest:0:1}\n";
    o += "        rest=${rest:1}\n";
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

function emitMatchChild(
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

function emitSimulate(ident: string): string {
  let o = "_${ident}_nac_simulate() {\n".replace("${ident}", ident);
  o += "  local i=1 sid=0 w steps next\n";
  o += "  while (( i < COMP_CWORD )); do\n";
  o += '    w="${COMP_WORDS[i]}"\n';
  o += `    if [[ $w == ${kHelpShort} || $w == ${kHelpLong} ]]; then\n`;
  o += "      ((i++)); continue\n";
  o += "    fi\n";
  o += "    if [[ $w == --* ]]; then\n";
  o += '      steps=$(_${ident}_nac_consume_long "$sid" "$w" "${COMP_WORDS[i+1]}")\n'.replace(
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

function emitEnumReplyBash(ident: string, scopes: ScopeRec[]): string {
  let o = "_${ident}_nac_enum_reply() {\n".replace("${ident}", ident);
  o += '  local sid="$1" prev="$2" cur="$3"\n';
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    const enumOpts = sc.opts.filter(
      (op) => op.kind === CliOptionKind.Enum && (op.choices?.length ?? 0) > 0,
    );
    if (enumOpts.length === 0) continue;
    o += `    ${i})\n`;
    o += "      case $prev in\n";
    for (const op of enumOpts) {
      const words = (op.choices ?? []).map((c) => escShellSingleQuoted(c)).join(" ");
      o +=
        "        --" +
        op.name +
        ") COMPREPLY=( $(compgen -W '" +
        words +
        '\' -- "$cur") ); return 0 ;;\n';
    }
    o += "      esac\n";
    o += "      ;;\n";
  }
  o += "  esac\n";
  o += "  return 1\n";
  o += "}\n";
  return o;
}

function emitMainBodyBash(schema: CliRouter, ident: string): string {
  const main = mainName(schema.key);
  let o = "_${main}() {\n".replace("${main}", main);
  o += '  local cur="${COMP_WORDS[COMP_CWORD]}"\n';
  o += '  local prev="${COMP_WORDS[COMP_CWORD-1]:-}"\n';
  o += "  _${ident}_nac_simulate\n".replace("${ident}", ident);
  o += "  local sid=$REPLY_SID\n";
  o += '  if _${ident}_nac_enum_reply "$sid" "$prev" "$cur"; then return; fi\n'.replace(
    "${ident}",
    ident,
  );
  o += "  if [[ $cur == -* ]]; then\n";
  o += '    local oname="A_${ident}_${sid}_opts"\n'.replace("${ident}", ident);
  o += "    local -a optsarr\n";
  o += '    local -n optsref="$oname"\n';
  o += '    COMPREPLY=( $(compgen -W "${optsref[*]}" -- "$cur") )\n';
  o += "  else\n";
  o += '    local lname="A_${ident}_${sid}_leaf"\n'.replace("${ident}", ident);
  o += '    local -n leafref="$lname"\n';
  o += "    if [[ $leafref -eq 0 ]]; then\n";
  o += '      local cname="A_${ident}_${sid}_cmds"\n'.replace("${ident}", ident);
  o += "      local -a cmdsarr\n";
  o += '      local -n cmdsref="$cname"\n';
  o += '      COMPREPLY=( $(compgen -W "${cmdsref[*]}" -- "$cur") )\n';
  o += "    else\n";
  o += '      local pname="A_${ident}_${sid}_pos"\n'.replace("${ident}", ident);
  o += '      local -n posref="$pname"\n';
  o += "      if [[ $posref -eq 1 ]]; then\n";
  o += "        compopt -o filenames\n";
  o += "      fi\n";
  o += "    fi\n";
  o += "  fi\n";
  o += "}\n\n";
  o += "complete -F _${main} ${schema.key}\n"
    .replace("${main}", main)
    .replace("${schema.key}", schema.key);
  return o;
}

/** Returns a self-contained bash `complete` script for the given program schema. */
export function completionBashScript(schema: CliRouter): string {
  const ident = identToken(schema.key);
  const scopes = collectScopes(schema);
  const pathIndex: Record<string, number> = {};
  for (const [i, s] of scopes.entries()) {
    pathIndex[s.path] = i;
  }

  let out = `# Generated bash completion for ${schema.key}.\n\n`;

  for (const [i, sc] of scopes.entries()) {
    out += `A_${ident}_${i}_opts=()\n`;
    out += `A_${ident}_${i}_opts+=('${kHelpLong}' '${kHelpShort}')\n`;
    for (const o of sc.opts) {
      out += `A_${ident}_${i}_opts+=('--${o.name}')\n`;
      if (o.shortName) {
        out += `A_${ident}_${i}_opts+=('-${o.shortName}')\n`;
      }
    }
    out += `A_${ident}_${i}_leaf=${sc.kids.length === 0 ? "1" : "0"}\n`;
    out += `A_${ident}_${i}_pos=${sc.wantsFiles ? "1" : "0"}\n`;
    if (sc.kids.length > 0) {
      out += `A_${ident}_${i}_cmds=(`;
      for (const ch of sc.kids) {
        out += ` '${ch.key}'`;
      }
      out += ")\n";
    }
  }

  out += emitConsumeLong(ident, scopes);
  out += emitConsumeShort(ident, scopes);
  out += emitMatchChild(ident, scopes, pathIndex);
  out += emitSimulate(ident);
  out += emitEnumReplyBash(ident, scopes);
  out += emitMainBodyBash(schema, ident);

  return out;
}
