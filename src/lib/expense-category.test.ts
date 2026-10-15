import { expect, it } from "vitest";
import { descriptionExpenseCategory, normalizeExpenseCategories } from "./expense-category";
import type { AIResult } from "./ai-processor";
it.each([
  ["ZE*DELIVERY", "Delivery"], ["Zé Delivery", "Delivery"], ["Uber Eats", "Delivery"],
  ["Google*Ads", "Marketing"], ["FACEBK*123", "Marketing"], ["Facebook Serviços Online", "Marketing"],
  ["Google Workspace", "Tecnologia"], ["GOOGLE*Serviços", "Serviços"], ["YouTube Premium", "Assinaturas"],
  ["Drogasil", "Saúde"], ["DARF", "Impostos"], ["Energia elétrica", "Moradia"],
])("uses merchant or purpose evidence in %s", (description, expected) => expect(descriptionExpenseCategory(description)).toBe(expected));
it.each(["NETFLIX.COM", "SPOTIFY PREMIUM", "Spotfy", "IFD*IFOOD CLUB", "iFood Clube", "Clube iFood", "Disney Plus", "Prime Video", "Assinatura Canva"])("groups identifiable subscription %s across past and future bank movements",description=>{
  expect(descriptionExpenseCategory(description)).toBe("Assinaturas");
});
it.each(["iFood restaurante", "IFD*KARMUS ESFIHARIA", "Apple.Com/Bill", "Pix enviado para Netflix", "Mensalidade escolar"])("does not label an ambiguous or different payment %s as a subscription",description=>{
  expect(descriptionExpenseCategory(description)).not.toBe("Assinaturas");
});
it.each(["Mercado Pago", "Mercado Livre", "Amazon", "Google Pay", "Facebook Marketplace", "Meta Pay", "Pix - Pessoa", ""])("does not guess the purchase category from an intermediary/ambiguous name: %s", text => expect(descriptionExpenseCategory(text)).toBeNull());
const result = (description: string, category: string, type = "expense") => ({ intent: "finance_register", confidence: .95, finance: { description, category, type, amount: 50, date: "2026-10-11", mode: "business", accountHint: "Conta teste", registeredByName: "Ana teste" } }) as AIResult;
it("corrects model categories while preserving all transaction fields", () => {
  const original=result("Google Ads","Moradia");
  expect(normalizeExpenseCategories("gastei 50 com Google Ads",original)).toEqual({...original,finance:{...original.finance,category:"Marketing"}});
});
it("does not rewrite an explicitly chosen custom category, incomes or edits", () => {
  const chosen=result("Zé Delivery","Evento empresa");
  expect(normalizeExpenseCategories("gastei 50 no Zé Delivery na categoria Evento empresa",chosen)).toEqual(chosen);
  const income=result("Google","Salário","income"); expect(normalizeExpenseCategories("recebi 50 do Google",income)).toEqual(income);
  const edit={...chosen,intent:"finance_edit" as const}; expect(normalizeExpenseCategories("altere a categoria para Moradia",edit)).toEqual(edit);
});
it("corrects each expense of a batch independently and keeps unknown items categorized as Outros",()=>{
  const original={intent:"finance_register",confidence:1,finances:[result("Zé Delivery","Outros").finance!,result("FACEBK*123","Lazer").finance!,result("Pix - Pessoa","").finance!] } as AIResult;
  expect(normalizeExpenseCategories("registrei três gastos",original).finances?.map(item=>item.category)).toEqual(["Delivery","Marketing","Outros"]);
});
it("does not let an explicit category for one item disable automatic categorization of another",()=>{
  const original={intent:"finance_register",confidence:1,finances:[result("Google Ads","Moradia").finance!,result("Zé Delivery","Evento empresa").finance!]} as AIResult;
  expect(normalizeExpenseCategories("gastei 50 no Google Ads e 30 no Zé Delivery, este na categoria Evento empresa",original).finances?.map(item=>item.category)).toEqual(["Marketing","Evento empresa"]);
});
it("does not mistake a request to choose automatically for an explicit category",()=>{
  expect(normalizeExpenseCategories("gastei 50 Google Ads, escolha a categoria automaticamente",result("Google Ads","Moradia")).finance?.category).toBe("Marketing");
});
it("binds a category to its item when another item mentions that category",()=>{
  const original={intent:"finance_register",confidence:1,finances:[result("Google Ads","Lazer").finance!,result("Netflix","Lazer").finance!]} as AIResult;
  expect(normalizeExpenseCategories("gastei 50 no Google Ads e 30 no Netflix na categoria Lazer",original).finances?.map(item=>item.category)).toEqual(["Marketing","Lazer"]);
});
it.each(["gastei 50 no Google Ads\nCategoria: Evento empresa","gastei 50 no Google Ads; categoria Evento empresa"])("preserves a single explicit category on a separate line/clause: %s",message=>{
  expect(normalizeExpenseCategories(message,result("Google Ads","Evento empresa")).finance?.category).toBe("Evento empresa");
});
it("attaches a separate category line to the preceding item in a batch",()=>{
  const original={intent:"finance_register",confidence:1,finances:[result("Google Ads","Moradia").finance!,result("Zé Delivery","Evento empresa").finance!]} as AIResult;
  expect(normalizeExpenseCategories("gastei 50 no Google Ads\n30 no Zé Delivery\nCategoria: Evento empresa",original).finances?.map(item=>item.category)).toEqual(["Marketing","Evento empresa"]);
});
it.each(["IOF", "Juros do cartão", "Tarifa bancária", "Anuidade do cartão", "Encargos financeiros"])("categorizes banking charges independently: %s",description=>{
  expect(descriptionExpenseCategory(description)).toBe("Encargos bancários");
  expect(normalizeExpenseCategories(`paguei 50 de ${description}`,result(description,"Outros")).finance?.category).toBe("Encargos bancários");
});

it.each([["Compra parcelada sem juros — Drogasil", "Saúde"],["Google Ads sem juros", "Marketing"]])("does not turn a purchase without interest into bank charges: %s",(description,category)=>expect(descriptionExpenseCategory(description)).toBe(category));

it.each(["Delivery de eletrônicos","Delivery de livros","Delivery de cosméticos","Delivery de tênis"])("does not infer food from a delivery of named non-food goods: %s",description=>{
  expect(descriptionExpenseCategory(description)).not.toBe("Delivery");
  expect(normalizeExpenseCategories(`gastei 50 com ${description}`,result(description,"Delivery")).finance?.category).not.toBe("Delivery");
});
it("distinguishes a delivery brand from an explicitly chosen Delivery category",()=>{
  expect(normalizeExpenseCategories("gastei 50 de IOF no Zé Delivery",result("IOF Zé Delivery","Delivery")).finance?.category).toBe("Encargos bancários");
  const original=result("Delivery de medicamentos","Delivery");
  expect(normalizeExpenseCategories("gastei 50 em medicamentos, na categoria Delivery",original)).toEqual(original);
});
