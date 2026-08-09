import { readFileSync, writeFileSync, existsSync, renameSync } from "fs";

/** writeFileSync direto deixa uma janela onde, se o processo morrer no meio
 *  da escrita (crash, OOM kill, deploy derrubando o container), o arquivo
 *  fica truncado/corrompido — JSON.parse falha pra sempre depois, e todo
 *  load() cai no fallback vazio, ou seja, perda silenciosa de todos os
 *  registros daquele arquivo, não só do que estava sendo escrito. Grava
 *  num arquivo temporário e troca com rename, que é atômico no mesmo
 *  filesystem: o arquivo final nunca fica pela metade.
 *
 *  Isso NÃO cobre duas instâncias/processos diferentes escrevendo o mesmo
 *  arquivo ao mesmo tempo (só dá pra resolver de verdade com lock de
 *  arquivo entre processos ou um banco de dados) — mas elimina o caso mais
 *  comum e mais destrutivo, que é corrupção por escrita interrompida. */
export function writeJSONAtomic<T>(file: string, data: T): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

export function readJSON<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}
