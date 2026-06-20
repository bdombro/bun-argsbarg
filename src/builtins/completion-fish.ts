import { CliNode, CliRouter, CliOptionKind } from "../types.ts";
import { collectScopes } from "./scopes.ts";
import {
  escFishSingleQuoted,
  identToken,
  kHelpLong,
  kHelpShort,
  kSchemaDesc,
  kSchemaLong,
} from "./shell-helpers.ts";

function scopeCondition(ident: string, scopeIndex: number, path: string): string {
  const fn = `__${ident}_scope_${scopeIndex}`;
  let body = `function ${fn}\n`;
  body += `    set -l tokens (commandline -opc)\n`;
  if (path === "") {
    body += `    test (count $tokens) -eq 0\n`;
  } else {
    const parts = path.split("/");
    body += `    test (count $tokens) -eq ${parts.length}\n`;
    for (let i = 0; i < parts.length; i++) {
      body += `    and test $tokens[${i + 1}] = ${parts[i]}\n`;
    }
  }
  body += `end\n\n`;
  return body;
}

/** Returns a self-contained fish completion script for the given program schema. */
export function completionFishScript(schema: CliRouter): string {
  const ident = identToken(schema.key);
  const app = schema.key;
  const scopes = collectScopes(schema);

  let out = "# Fish completion for " + app + "\n\n";

  for (const [i, sc] of scopes.entries()) {
    out += scopeCondition(ident, i, sc.path);
    const cond = `__${ident}_scope_${i}`;

    for (const ch of sc.kids) {
      out += `complete -c ${app} -n '${cond}' -a '${escFishSingleQuoted(ch.key)}' -d '${escFishSingleQuoted(ch.description)}'\n`;
    }

    out += `complete -c ${app} -n '${cond}' -s h -l help -d '${escFishSingleQuoted("Show help for this command.")}'\n`;
    if (sc.path === "") {
      out += `complete -c ${app} -n '${cond}' -l schema -d '${escFishSingleQuoted(kSchemaDesc)}'\n`;
    }

    for (const op of sc.opts) {
      if (op.kind === CliOptionKind.Presence) {
        const shortPart = op.shortName ? `-s ${op.shortName} ` : "";
        out += `complete -c ${app} -n '${cond}' ${shortPart}-l ${op.name} -d '${escFishSingleQuoted(op.description)}'\n`;
      } else if (op.kind === CliOptionKind.Enum && (op.choices?.length ?? 0) > 0) {
        const shortPart = op.shortName ? `-s ${op.shortName} ` : "";
        out += `complete -c ${app} -n '${cond}' ${shortPart}-l ${op.name} -d '${escFishSingleQuoted(op.description)}'\n`;
        const enumCond = `${cond}; and __fish_seen_argument -l ${op.name}`;
        for (const choice of op.choices ?? []) {
          out += `complete -c ${app} -n '${enumCond}' -a '${escFishSingleQuoted(choice)}'\n`;
        }
      } else {
        const shortPart = op.shortName ? `-s ${op.shortName} ` : "";
        out += `complete -c ${app} -n '${cond}' ${shortPart}-l ${op.name} -d '${escFishSingleQuoted(op.description)}' -r\n`;
      }
    }

    if (sc.wantsFiles && sc.kids.length === 0) {
      out += `complete -c ${app} -n '${cond}' -F\n`;
    }
  }

  return out;
}
