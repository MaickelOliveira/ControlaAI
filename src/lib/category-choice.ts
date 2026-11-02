const normalize=(value:string)=>value.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().trim();
export function validCategoryName(value:unknown):value is string{return typeof value==="string"&&value.trim().length>0&&value.trim().length<=100&&!/[\x00-\x1f]/.test(value);}
export function categoryCreateRequest(message:string):{name:string;type?:"expense"|"income"}|null{
 const match=message.trim().match(/^(?:(?:quero|desejo)\s+)?(?:cadastrar|cadastre|criar|crie|crear|registrar)\s+(?:uma?\s+)?(?:(?:nova|nueva)\s+)?categor[ií]a\b(?:\s+de\s+(despesa|receita|gasto|ingreso)s?)?(?:\s*(?::|chamada|llamada)\s*|\s+|$)(.*?)[.!?]*$/i);
 if(!match)return null;
 return {name:match[2].trim(),...(/^(receita|ingreso)/i.test(match[1]??"")?{type:"income" as const}:/^(despesa|gasto)/i.test(match[1]??"")?{type:"expense" as const}:{})};
}
export function asksCategoryChoices(message:string){return /^(?:(?:quais|qual|que|cuales)\s+(?:(?:sao|son)\s+)?(?:as\s+|las\s+)?|(?:mostre|listar|liste|ver|escolher|trocar|alterar|elegir|cambiar)\s+(?:as?\s+)?)(?:minhas\s+|mis\s+)?categorias?(?:\s+(?:disponiveis|existentes|de despesas|de receitas))?[?!.]*$/.test(normalize(message));}
export function selectedCategory(message:string,categories:readonly string[]){const name=normalize(message).replace(/^(?:(?:muda|mude|troque|trocar|altere|alterar|cambia)\s+(?:a\s+)?)?categoria\s*(?:(?:para|pra|por|a)\s+|:\s*)?/,"").replace(/[.!?]+$/,"");return categories.find(category=>normalize(category)===name);}
export function categoryChoicesMessage(categories:readonly string[],es=false){return `${es?"🏷️ Categorías disponibles":"🏷️ Categorias disponíveis"}\n\n${[...new Set(categories)].map(name=>`• ${name}`).join("\n")}\n\n${es?"➕ Registrar nueva categoría: responde crear categoría y el nombre. Para elegir una existente, responde categoría y el nombre.":"➕ Cadastrar nova categoria: responda cadastrar categoria e o nome. Para escolher uma existente, responda categoria e o nome."}`;}
