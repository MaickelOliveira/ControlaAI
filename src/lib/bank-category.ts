import type {BankMovement} from "./open-finance-report";

export type BankCategory={name:string;source:"user"|"provider"|"description"|"unclassified"|"excluded"};
// Polp Celcoin taxonomy: https://polp.com.br/docs/celcoin/categories
const expenseFamilies:Record<string,string>={FOOD_AND_DRINK:"Alimentação",TRANSPORTATION:"Transporte",MEDICAL:"Saúde",ENTERTAINMENT:"Lazer",TRAVEL:"Lazer",HOME_IMPROVEMENT:"Moradia",RENT_AND_UTILITIES:"Moradia",GENERAL_SERVICES:"Serviços",PERSONAL_CARE:"Serviços",BANK_FEES:"Serviços",GENERAL_MERCHANDISE:"Outros",GOVERNMENT_AND_NON_PROFIT:"Outros"};
const specific:Record<string,string>={GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES:"Vestuário",GENERAL_MERCHANDISE_ELECTRONICS:"Tecnologia",GENERAL_SERVICES_EDUCATION:"Educação",GENERAL_SERVICES_AUTOMOTIVE:"Transporte",GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT:"Impostos"};
const incomeCategories:Record<string,string>={INCOME_SALARY:"Salário",INCOME_CONTRACTOR:"Freelance",INCOME_GIG_ECONOMY:"Serviços",INCOME_RENTAL:"Aluguel",INCOME_DIVIDENDS:"Investimentos",INCOME_INTEREST_EARNED:"Investimentos",INCOME_TAX_REFUND:"Reembolso"};
const expenseDescriptions:Array<[RegExp,string]>=[
 [/\b(?:facebook servicos online|facebook ads|google ads|meta ads|anuncios|publicidade)\b/,"Marketing"],
 [/\b(?:supermercado|mercearia|restaurante|padaria|ifood|refeicao|lanchonete)\b/,"Alimentação"],
 [/\b(?:uber|99app|combustivel|gasolina|estacionamento|pedagio)\b/,"Transporte"],
 [/\b(?:farmacia|drogaria|hospital|dentista|clinica medica)\b/,"Saúde"],
 [/\b(?:mensalidade escolar|faculdade|universidade|curso)\b/,"Educação"],
 [/\b(?:netflix|spotify|cinema)\b/,"Lazer"],
 [/\b(?:darf|das mei|iptu|ipva|tributo|imposto)\b/,"Impostos"],
 [/\b(?:tarifa bancaria|juros bancarios)\b/,"Serviços"],
];

export function bankCategory(movement:BankMovement):BankCategory {
  if(movement.kind==="excluded")return {name:"Transferências e pagamentos",source:"excluded"};
  if(movement.user_category?.trim())return {name:movement.user_category.trim(),source:"user"};
  const income=movement.resource_type!=="card"&&movement.direction==="credit";
  const code=movement.source_category;
  const provider=code?(income?incomeCategories[code]:specific[code]??Object.entries(expenseFamilies).find(([family])=>code===family||code.startsWith(family+"_"))?.[1]):undefined;
  if(provider)return {name:provider,source:"provider"};
  const description=movement.description.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const name=income?
    /\b(?:salario|folha de pagamento)\b/.test(description)?"Salário":/\b(?:reembolso|restituicao)\b/.test(description)?"Reembolso":undefined:
    expenseDescriptions.find(([pattern])=>pattern.test(description))?.[1];
  return name?{name,source:"description"}:{name:"A categorizar",source:"unclassified"};
}
