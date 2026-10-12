import {normalizeMerchantText as normalize} from "./merchant-text";

/** A request to list records differs from a request to explain a category. */
export function categoryDetailQuestion(message:string,categories:readonly string[]):string|null {
  const text=normalize(message);
  if(/\b(?:registr\w*|anot\w*|lanc(?!amentos?\b)\w*|pagu\w*|pagar|cri[ae]\w*|exclu\w*|apag\w*|alter\w*|edit\w*|corrig\w*)\b/.test(text))return null;
  if(!/\b(?:descrev\w*|detalh\w*|list\w*|mostr\w*)\b|\bo que (?:tem|ha|esta)\b|\bquais (?:sao )?(?:os )?(?:lancamentos|movimentacoes|gastos|receitas)\b/.test(text))return null;
  return [...new Set(categories)].sort((a,b)=>b.length-a.length).find(category=>{
    const target=normalize(category);
    return !!target&&["categoria ","em ","no ","na ","de ","do ","da "].some(prefix=>` ${text} `.includes(` ${prefix}${target} `));
  })??null;
}
