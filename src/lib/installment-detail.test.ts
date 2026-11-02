import {expect,it} from "vitest";
import {parseInstallmentDetailQuestion as parse,installmentDetailRows,formatInstallmentDetail} from "./installment-detail";
import type {BankOverview} from "./open-finance-display";
import type {BankInstallmentAnchor} from "./bank-installment-projections";
import type {RecurringTransaction} from "./recurring";
it.each([
 ["quando e minha ultima parcela do veiculo","last-date","vehicle",["veiculo"]],
 ["Quando termina meu empréstimo no Banco Exemplo?","last-date","loan",["exemplo"]],
 ["qual a última parcela do parcelamento da Loja Azul?","last-date","installment",["loja","azul"]],
 ["quantas parcelas faltam do empréstimo no Exemplo","remaining","loan",["exemplo"]],
 ["quantas parcelas já paguei do veículo","paid","vehicle",["veiculo"]],
 ["qual o valor da parcela do carro","amount","vehicle",["veiculo"]],
 ["quando vence a próxima parcela do crédito da Loja Azul","next-date",undefined,["loja","azul"]],
 ["qual o primeiro vencimento do financiamento","first-date","loan",[]],
])("extracts the requested field and named target: %s",(message,view,kind,keywords)=>expect(parse(message as string)).toEqual({view,kind,keywords}));
it.each(["quanto elimino de contas até janeiro","quais empréstimos terminam até janeiro","quanto tenho de limite no Santander","quanto gastei mês passado","registre uma parcela do carro","cancele o empréstimo"])("preserves other financial queries and mutations: %s",message=>expect(parse(message)).toBeNull());
const data={connections:[{id:"one",status:"active",institution_name:"Banco Exemplo"},{id:"revoked",status:"revoked",institution_name:"Banco Antigo"}],resources:[{id:"car",connection_id:"one",resource_type:"financing",name:"Veículos leves"},{id:"loan",connection_id:"one",resource_type:"loan",name:"Crédito pessoal"},{id:"card",connection_id:"one",resource_type:"card",name:"Gold"},{id:"hidden",connection_id:"revoked",resource_type:"loan",name:"Segredo"}],credit:[{resource_id:"car",currency:"BRL",next_installment_amount:null,due_date:"2027-06-20",paid_installments:3,total_installments:12,remaining_installments:9},{resource_id:"loan",currency:"BRL",next_installment_amount:"50",due_date:"2027-02-10",outstanding_amount:"200",paid_installments:1,total_installments:4}],installment_plans:[{resource_id:"car",currency:"BRL",amount:"100",first_due_date:"2026-07-20",last_due_date:"2027-06-20"}]} as BankOverview;
const anchors=[{id:"purchase",resource_id:"card",description:"Loja Azul",institution_name:"Banco Exemplo",resource_name:"Gold",amount:"30",currency:"BRL",bill_month:"2026-10-01",observed_installments:2,total_installments:5}] as BankInstallmentAnchor[];
it("answers the final vehicle date using the saved schedule, retaining bank values and payment counts",()=>{
 const rows=installmentDetailRows(data,anchors,[],[],"2026-11-02"),car=rows.find(row=>row.id==="credit:car")!;
 expect(car).toMatchObject({lastDate:"2027-06-20",firstDate:"2026-07-20",nextDate:"2026-11-20",paid:3,remaining:9,total:12,amount:100});
 const answer=formatInstallmentDetail(rows,parse("quando e minha ultima parcela do veiculo")!,"Pessoal");expect(answer).toContain("20/06/2027");expect(answer).not.toContain("Crédito pessoal");expect(answer).not.toContain("Até qual data");expect(rows.some(row=>row.name==="Segredo")).toBe(false);
});
it("answers loans separately and preserves a named bank qualifier",()=>{
 const rows=installmentDetailRows(data,anchors,[],[],"2026-11-02");
 expect(formatInstallmentDetail(rows,parse("quando termina meu empréstimo pessoal no Banco Exemplo")!,"Pessoal")).toContain("10/02/2027");
 expect(formatInstallmentDetail(rows,parse("quando termina meu empréstimo no Banco Ausente")!,"Pessoal")).not.toContain("10/02/2027");
});
it("reports the card final month without inventing a due day or payment confirmation",()=>{
 const rows=installmentDetailRows(data,anchors,[],[],"2026-11-02");
 expect(formatInstallmentDetail(rows,parse("quando termina o parcelamento da Loja Azul")!,"Pessoal")).toContain("01/2027 (dia não informado");
 expect(formatInstallmentDetail(rows,parse("quantas parcelas paguei na Loja Azul")!,"Pessoal")).toContain("não confirmadas pelo banco");
 expect(formatInstallmentDetail(rows,parse("quantas parcelas faltam na Loja Azul")!,"Pessoal")).toContain("3 após a parcela identificada 2/5");
});
it("includes manual and imported installments and does not turn unknown dates into an empty balance",()=>{
 const registered=[{id:"manual",description:"Notebook",recurrenceType:"installment",type:"expense",status:"active",amount:40,paidInstallments:2,totalInstallments:5,nextDueDate:"2026-11-10",startDate:"2026-09-10",repeatUnit:"monthly"}] as RecurringTransaction[];
 const rows=installmentDetailRows(null,[],registered,[{description:"Fogão",amount:20,current:2,total:4,remaining:2,date:"2026-10-10",mode:"personal"}],"2026-11-02");
 expect(formatInstallmentDetail(rows,parse("quando termina o parcelamento Notebook")!,"Pessoal")).toContain("10/01/2027");
 expect(formatInstallmentDetail(rows,parse("qual a ultima parcela do Fogão")!,"Pessoal")).toContain("10/12/2026");
 const unknown=installmentDetailRows({...data,credit:data.credit.map(c=>({...c,due_date:null})),installment_plans:[]},[],[],[],"2026-11-02");
 expect(formatInstallmentDetail(unknown,parse("quando e minha ultima parcela do veiculo")!,"Pessoal")).toContain("não informada");
});
