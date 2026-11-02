import type {BankOverview} from "./open-finance-display";
import {bankDate,bankMoney} from "./open-finance-display";
import type {BankInstallmentAnchor} from "./bank-installment-projections";
import type {RecurringTransaction} from "./recurring";
import type {ImportedInstallmentStatus} from "./finances";
import {creditPlanDates} from "./credit-installment-plan";
import {recurringInstallmentEnd,installmentEndMonth} from "./installment-progress";
import {ledgerAmount} from "./finance-ledger";
import {normalizeMerchantText} from "./merchant-text";
export type InstallmentDetailView="last-date"|"first-date"|"next-date"|"remaining"|"paid"|"total"|"amount"|"balance";
export type InstallmentDetailQuestion={view:InstallmentDetailView;kind?:"loan"|"vehicle"|"installment"|"recurring";keywords:string[]};
const amount=(raw:string|number|null|undefined)=>ledgerAmount(raw==null?null:String(raw));
const normalize=(text:string)=>normalizeMerchantText(text).replace(/_/g," ").replace(/\b(?:carros?|veiculos?|automoveis|automovel|utilitarios?|motos?|motocicletas?)\b/g,"veiculo");
/** Extract the requested field and retain all named targets; never interpret a
 * last-installment question as a cutoff supplied by the customer. */
export function parseInstallmentDetailQuestion(message:string):InstallmentDetailQuestion|null{
 const text=normalize(message);
 if(/[?!.]\s*\S/.test(message)||/\b(?:valor confiavel|total conhecido|neste mes|nesse mes|este mes|esse mes)\b/.test(text))return null;
 if(!/^(?:rita |zelo )?(?:quando|qual|quais|quanto|quantas|quantos|em que|em qual|que dia|que mes|ate quando|me diga|me fale|me mostre|mostre|informe|quero saber|gostaria de saber|pode me dizer)/.test(text)||/\b(?:cancele|cancelar|cadastre|cadastrar|registre|registrar|lance|lancar|altere|alterar|exclua|apague)\b/.test(text))return null;
 if(!/\b(?:parcelas?|parcelad[oa]s?|parcelamentos?|prestacoes?|emprestimos?|financiamentos?|veiculo|assinaturas?|recorrentes?|cuotas?|prestamos?)\b/.test(text))return null;
 if(/\b(?:elimino|eliminar|libero|me livro|deixo de pagar|ate|hasta)\b/.test(text)&&!/^ate quando\b/.test(text))return null;
 const view:InstallmentDetailView|undefined=/\b(?:ultima|ultimo|termina|terminam|acaba|acabam|encerra|encerram|termino|prazo final|data final|fim)\b/.test(text)?"last-date":/\b(?:primeira|primeiro)\b/.test(text)?"first-date":/\b(?:saldo devedor|devo|falta(?: pra| para)?(?: min| mim| eu)? pagar|falta para quitar)\b/.test(text)?"balance":/\b(?:pagas|paguei|pagou)\b/.test(text)?"paid":/\b(?:faltam|falta|restam|resta|restantes|quedan|faltan)\b/.test(text)?"remaining":/\b(?:quantas|quantos|quantidade|total)\b/.test(text)?"total":/\b(?:valor|custa|quanto e|de quanto|quanto vou pagar)\b/.test(text)?"amount":/\b(?:quando|vencimento|vence|data|proxima)\b/.test(text)?"next-date":undefined;
 if(!view)return null;
 const kind=/\bveiculo\b/.test(text)?"vehicle":/\b(?:emprestimos?|prestamos?|financiamentos?)\b/.test(text)?"loan":/\b(?:assinaturas?|recorrentes?)\b/.test(text)?"recurring":/\b(?:parcelad[oa]s?|parcelamentos?)\b/.test(text)?"installment":undefined;
 const ignored=new Set("fim termino prazo final min mim cada rita zelo quando qual quais quanto quantas quantos e eh a o os as um uma meu minha meus minhas do da dos das de no na nos nas em ao aos para pra por com que se eu voce ja ainda faltam falta restam resta restantes pagas pagou paguei ao todo total quantidade valor custa vou pagar saldo devedor devo quitar primeira primeiro ultima ultimo proxima proximo vencimento vencimentos vence vencem data dia mes termina terminam acaba acabam encerra encerram parcelas parcela parcelados parceladas parcelado parcelada parcelamentos parcelamento prestacao prestacoes emprestimo emprestimos financiamento financiamentos compras compra cartao cartoes credito banco pessoal personal modo empresa empresarial pj pf ate me diga fale mostre informe quero saber gostaria pode dizer assinatura assinaturas recorrente recorrentes".split(" "));
 const keywords=[...new Set(text.split(/[^a-z0-9]+/).filter(word=>word&&!ignored.has(word)))];
 return {view,kind,keywords};
}
export type InstallmentDetailRow={id:string;name:string;origin:string;kind:"loan"|"vehicle"|"installment"|"recurring";amount:number|null;currency:string|null;lastDate:string|null;monthOnly?:boolean;firstDate?:string|null;nextDate?:string|null;paid?:number|null;remaining?:number|null;total?:number|null;balance?:number|null;observed?:number;registered?:boolean};
export function installmentDetailRows(overview:BankOverview|null,anchors:readonly BankInstallmentAnchor[],registered:readonly RecurringTransaction[],imported:readonly ImportedInstallmentStatus[],today:string):InstallmentDetailRow[]{
 const rows:InstallmentDetailRow[]=registered.filter(row=>row.status!=="cancelled").map(row=>({id:`manual:${row.id}`,name:row.description,origin:"Cadastro Zelo",kind:row.recurrenceType==="installment"?"installment":"recurring",amount:row.amount,currency:"BRL",lastDate:row.recurrenceType==="installment"?recurringInstallmentEnd(row):null,firstDate:row.startDate,nextDate:row.nextDueDate,paid:row.recurrenceType==="installment"?row.paidInstallments:null,remaining:row.totalInstallments==null?null:Math.max(0,row.totalInstallments-row.paidInstallments),total:row.totalInstallments,registered:true}));
 for(const row of imported){if(rows.some(r=>r.kind==="installment"&&r.total===row.total&&r.amount===row.amount&&normalize(r.name)===normalize(row.description)))continue;rows.push({id:`imported:${rows.length}`,name:row.description,origin:"Fatura importada",kind:"installment",amount:row.amount,currency:"BRL",lastDate:row.remaining>=0?recurringInstallmentEnd({nextDueDate:row.date,paidInstallments:row.current-1,totalInstallments:row.total,repeatUnit:"monthly"}):null,observed:row.current,remaining:row.remaining,total:row.total});}
 if(!overview)return rows;
 const connections=new Map(overview.connections.filter(c=>c.status==="active"&&!c.revoked_at&&!c.archived_at&&(!c.consent_expires_at||Date.parse(c.consent_expires_at)>Date.parse(`${today}T00:00:00Z`))).map(c=>[c.id,c]));
 for(const resource of overview.resources.filter(r=>connections.has(r.connection_id)&&(r.resource_type==="loan"||r.resource_type==="financing"))){
  const detail=overview.credit.find(c=>c.resource_id===resource.id),plan=overview.installment_plans?.find(p=>p.resource_id===resource.id),lastDate=detail?.due_date??plan?.last_due_date??null,firstDate=detail?.first_due_date??plan?.first_due_date??null;
  const total=detail?.total_installments??(plan?creditPlanDates(plan,plan.first_due_date,plan.last_due_date).length:null),paid=detail?.paid_installments??null;
  const monthly=detail?.periodicity==="MENSAL"||!!plan;
  const nextDate=monthly&&firstDate&&lastDate?creditPlanDates({resource_id:resource.id,amount:"1",currency:"BRL",first_due_date:firstDate,last_due_date:lastDate},today,lastDate)[0]??null:null;
  rows.push({id:`credit:${resource.id}`,name:resource.name,origin:connections.get(resource.connection_id)!.institution_name,kind:/\bveiculo\b/.test(normalize(resource.name))?"vehicle":"loan",amount:amount(detail?.next_installment_amount??plan?.amount),currency:detail?.currency??plan?.currency??null,lastDate,firstDate,nextDate,paid,total,remaining:detail?.remaining_installments??(total!=null&&paid!=null?Math.max(0,total-paid):null),balance:amount(detail?.outstanding_amount)});
 }
 const cards=new Set(overview.resources.filter(r=>connections.has(r.connection_id)&&r.resource_type==="card").map(r=>r.id));
 for(const row of anchors.filter(a=>cards.has(a.resource_id))){
  const final=installmentEndMonth(row.bill_month,row.observed_installments,row.total_installments);
  rows.push({id:`card:${row.id}`,name:row.description,origin:`${row.institution_name} · ${row.resource_name}`,kind:"installment",amount:ledgerAmount(row.amount),currency:row.currency,lastDate:final?`${final.slice(3)}-${final.slice(0,2)}-01`:null,monthOnly:true,observed:row.observed_installments,remaining:row.total_installments-row.observed_installments,total:row.total_installments});
 }
 return rows;
}
const safe=(text:string)=>text.replace(/[\r\n*`_~<>]/g," ").slice(0,160);
export function formatInstallmentDetail(rows:readonly InstallmentDetailRow[],question:InstallmentDetailQuestion,label:string,partial=false){
 const selected=rows.filter(row=>(!question.kind||row.kind===question.kind||(question.kind==="loan"&&row.kind==="vehicle"))&&question.keywords.every(keyword=>normalize(`${row.name} ${row.origin}`).includes(keyword)));
 const titles={"last-date":"Última parcela","first-date":"Primeira parcela","next-date":"Próximo vencimento",remaining:"Parcelas restantes",paid:"Parcelas pagas",total:"Total de parcelas",amount:"Valor da parcela",balance:"Saldo devedor"};
 const lines=selected.map(row=>{
  const date=(value:string|null|undefined)=>value?bankDate(value):"não informado";
  const value=question.view==="last-date"?(row.lastDate?(row.monthOnly?`${row.lastDate.slice(5,7)}/${row.lastDate.slice(0,4)} (dia não informado; previsão pela parcela identificada)`:date(row.lastDate)):row.kind==="recurring"?"sem data de término cadastrada":"não informada"):
   question.view==="first-date"?date(row.firstDate):question.view==="next-date"?date(row.nextDate):question.view==="amount"?row.amount==null?"não informado":bankMoney(row.amount,row.currency):question.view==="balance"?row.balance==null?"não informado":bankMoney(row.balance,row.currency):question.view==="paid"?row.paid==null?"não confirmadas pelo banco":`${row.paid}${row.registered?" conforme o cadastro":" informadas pelo banco"}`:question.view==="total"?row.total??"não informado":row.remaining==null?"não informadas":`${row.remaining}${row.observed!=null?` após a parcela identificada ${row.observed}/${row.total}`:""}`;
  return `• *${safe(row.name)}* · ${safe(row.origin)}\n  ${titles[question.view]}: *${value}*`;
 });
 return `${titles[question.view]} · ${safe(label)}\n\n${lines.join("\n\n")||"Não encontrei um contrato ou parcelamento correspondente nos dados disponíveis. Confira o nome ou o banco para localizar."}${selected.length>1?"\n\nEncontrei mais de um resultado. Informe o nome e o banco para consultar um deles.":""}${partial?"\nA consulta bancária está incompleta; os resultados disponíveis estão acima.":""}`;
}
