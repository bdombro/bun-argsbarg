/*
Shared shell completion emitters for bash and zsh simulate helpers.
Generates _nac_consume_long, _nac_consume_short, and _nac_match_child functions
used while walking argv to determine completion scope.
*/

import type { ScopeRec } from "./scopes.ts";
import { kHelpLong, kHelpShort } from "./shell-helpers.ts";

/** Which shell dialect to emit for bundled short-flag parsing. */
export type CompletionShellDialect = "bash" | "zsh";

/** Emits `_<ident>_nac_consume_long` — identical for bash and zsh. */
export function emitConsumeLong(ident: string, scopes: ScopeRec[]): string {
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

/** Emits `_<ident>_nac_consume_short`; dialect selects substring syntax. */
export function emitConsumeShort(
  ident: string,
  scopes: ScopeRec[],
  dialect: CompletionShellDialect,
): string {
  const firstChar = dialect === "bash" ? "ch=${rest:0:1}" : "ch=${rest[1,1]}";
  const restAdvance = dialect === "bash" ? "rest=${rest:1}" : "rest=${rest[2,-1]}";

  let o = "_${ident}_nac_consume_short() {\n".replace("${ident}", ident);
  o += '  local sid="$1" w="$2"\n';
  o += "  case $sid in\n";
  for (const [i, sc] of scopes.entries()) {
    o += `    ${i})\n`;
    o += "      local rest=${w#-}\n";
    o += "      local ch\n";
    o += "      local saw=0\n";
    o += "      while [[ -n $rest ]]; do\n";
    o += `        ${firstChar}\n`;
    o += `        ${restAdvance}\n`;
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

/** Emits `_<ident>_nac_match_child` — identical for bash and zsh. */
export function emitMatchChild(
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
