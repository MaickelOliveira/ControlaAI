import { cardLimitAmountsDisagree, displayCardLimits, headlineCardLimit } from "./bank-card-limit";
import { bankDate, bankMoney, bankResourceName, type BankOverview, type BankResource } from "./open-finance-display";
import { normalizeBankText, type BankQuestion } from "./bank-question-parser";
import { hasZeroBankDebt, matchesBankDebtPurpose } from "./bank-debt";
const safe = (text: string) => text.replace(/[\r\n*`_~<>]/g, " ").slice(0, 180);
const canonicalBank = (text: string) => normalizeBankText(text).replace(/^banco /, "").replace(/ (?:pessoa fisica|pessoa juridica|pf|pj)$/, "");
const includesName = (text: string, name: string) => ` ${normalizeBankText(text)} `.includes(` ${name} `);
export function matchingBankNames(names: string[], requested: string, exactOnly = false): string[] {
  const target = canonicalBank(requested);
  const exact = names.filter(name => canonicalBank(name) === target);
  return exact.length || exactOnly ? exact : names.filter(name => includesName(name, target));
}
type Amount = { amount: string | number | null | undefined; currency: string | null | undefined };

/** The database stores decimal amounts with eight places. Never sum through floating point. */
export function bankAmountTotals(values: Amount[], incomplete: boolean): string[] {
  const amounts = new Map<string, bigint>();
  let missing = false;
  for (const value of values) {
    const raw = String(value.amount ?? "");
    if (!value.currency || !/^-?\d{1,16}(\.\d{1,8})?$/.test(raw) || bankMoney(value.amount, value.currency) === "Não informado") { missing = true; continue; }
    const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
    const units = (BigInt(whole) * BigInt(100000000) + BigInt(fraction.padEnd(8, "0"))) * (raw.startsWith("-") ? BigInt(-1) : BigInt(1));
    amounts.set(value.currency, (amounts.get(value.currency) ?? BigInt(0)) + units);
  }
  return [...amounts].map(([currency, units]) => {
    const absolute = units < BigInt(0) ? -units : units;
    const text = `${units < BigInt(0) ? "-" : ""}${absolute / BigInt(100000000)}.${String(absolute % BigInt(100000000)).padStart(8, "0")}`;
    return `${incomplete || missing ? "Subtotal conhecido" : "Total informado"}: ${bankMoney(text, currency)}`;
  });
}

function banksFor(data: BankOverview, question: BankQuestion) {
  const active = data.connections.filter(c => c.status === "active" && !c.archived_at);
  const target = question.bankName ? canonicalBank(question.bankName) : null;
  const exact = target ? active.filter(c => canonicalBank(c.institution_name) === target) : [];
  const selected = !target ? active : exact.length ? exact : active.filter(c => includesName(c.institution_name, target) || data.resources.some(r => r.connection_id === c.id && includesName(r.name, target)));
  const groups = new Map<string, { name: string; resources: BankResource[] }>();
  for (const connection of selected) {
    const resources = data.resources.filter(r => r.connection_id === connection.id && (!question.last4 || r.identification_last4 === question.last4));
    if (question.last4 && !resources.length) continue;
    const key = connection.institution_id ?? connection.id;
    const group = groups.get(key) ?? { name: connection.institution_name, resources: [] };
    for (const resource of resources) if (!group.resources.some(r => r.id === resource.id)) group.resources.push(resource);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Format only the authenticated overview; no provider calls, model output or cross-mode joins. */
export function formatBankQuestion(data: BankOverview, question: BankQuestion, modeLabel: string): string {
  const connectedGroups = banksFor(data, question);
  if (!connectedGroups.length) return question.bankName || question.last4
    ? `Não encontrei ${safe(question.bankName ?? "esse cartão")}${question.last4 ? ` · final ${question.last4}` : ""} entre os bancos conectados em ${safe(modeLabel)}. Confira Contas e o modo/empresa selecionado.`
    : `Nenhum banco conectado em ${safe(modeLabel)}. A conexão fica na aba Contas.`;
  if(question.kind==="financings"&&question.financingView){
    const rows=connectedGroups.flatMap(group=>group.resources.filter(resource=>resource.resource_type==="financing"&&matchesBankDebtPurpose(resource,question.keyword))
      .map(resource=>({bank:group.name,resource,detail:data.credit.find(credit=>credit.resource_id===resource.id)})));
    const coverage=`${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
    if(!rows.length)return `Não encontrei financiamento correspondente a ${safe(question.keyword??"essa consulta")} nos dados recebidos em ${safe(modeLabel)}. Isso não confirma ausência de contrato; confira o banco.${coverage}`;
    const view=question.financingView;
    const selected=view==="missing-balance"?rows.filter(row=>bankMoney(row.detail?.outstanding_amount,row.detail?.currency)==="Não informado")
      :view==="zero"?rows.filter(row=>hasZeroBankDebt(row.resource,data)):rows;
    const description=(row:typeof rows[number])=>`${safe(row.bank)} · ${safe(bankResourceName(row.resource.name))}`;
    const lines=selected.slice(0,12).map(row=>{
      const name=description(row);
      if(view==="next-installment"){
        const amount=bankMoney(row.detail?.next_installment_amount,row.detail?.currency);
        return `• ${name}: ${amount==="Não informado"?"valor da próxima parcela não informado pelo banco":`próxima parcela de ${amount}`}`;
      }
      if(view==="last-installment-date")return `• ${name}: Vencimento da última parcela: não informado pelo banco · data final do contrato: ${bankDate(row.detail?.due_date)}`;
      if(view==="remaining-count")return `• ${name}: quantidade de parcelas restantes não informada pelo banco`;
      if(view==="contracted")return `• ${name}: valor contratado ${bankMoney(row.detail?.contract_amount,row.detail?.currency)}`;
      if(view==="missing-balance")return `• ${name}: saldo devedor não informado`;
      return `• ${name}: saldo devedor informado como zero${row.detail?.currency?` ${safe(row.detail.currency)}`:" (moeda não informada)"}`;
    });
    const title={"next-installment":"Próxima parcela dos financiamentos","last-installment-date":"Última parcela dos financiamentos","remaining-count":"Parcelas restantes dos financiamentos",contracted:"Valor contratado dos financiamentos","missing-balance":"Financiamentos sem saldo devedor informado",zero:"Financiamentos com saldo zero informado"}[view];
    const note=view==="last-installment-date"?" A data final do contrato não confirma o vencimento da última parcela; o banco não informou essa data separadamente."
      :view==="remaining-count"?" O banco não informou a quantidade de parcelas restantes; saldo e data final não permitem calculá-la com segurança."
      :view==="zero"?" Saldo zero não confirma quitação contratual; confirme o encerramento no banco."
      :view==="missing-balance"?" Ausência de saldo não significa saldo zero."
      :" Valores não informados permanecem desconhecidos.";
    return `${title} · ${safe(modeLabel)}${question.keyword?` · ${safe(question.keyword)}`:""}\n${selected.length} ${selected.length===1?"contrato":"contratos"} nos dados recebidos.\n${lines.join("\n")||"Nenhum contrato correspondente foi identificado."}${selected.length>12?`\nMais ${selected.length-12} contrato(s) em Contas.`:""}${note}${coverage}`;
  }
  if(question.kind==="investments"&&question.investmentView){
    const view=question.investmentView;
    const rows=connectedGroups.flatMap(group=>group.resources.filter(resource=>resource.resource_type==="investment").map(resource=>({bank:group.name,resource})));
    const coverage=`${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
    if(view==="missing-bank"){
      const names=connectedGroups.filter(group=>!group.resources.some(resource=>resource.resource_type==="investment")).map(group=>safe(group.name));
      return `Bancos sem investimentos recebidos · ${safe(modeLabel)}\n${names.length?names.slice(0,20).map(name=>`• ${name}`).join("\n"):"Todos os bancos conectados enviaram ao menos um investimento nos dados recebidos."}${names.length>20?`\nMais ${names.length-20} banco(s) em Contas.`:""}\nIsso não confirma ausência de investimentos nesses bancos; confira o banco e o compartilhamento de dados.${coverage}`;
    }
    if(!rows.length){
      const focus={"gross-net":"Não há valores bruto e líquido para listar.",latest:"Não há posição de investimento para comparar datas.","missing-date":"Não há investimentos recebidos para conferir quais estão sem data.",currency:"Não há valores de investimentos para separar por moeda."}[view];
      return `${focus} Nenhum investimento foi informado pelos bancos conectados em ${safe(modeLabel)}. Isso não confirma ausência de investimentos; confira cada banco. Valores de moedas diferentes não são somados.${coverage}`;
    }
    const validDate=(value:string|null)=>value&&/^\d{4}-\d{2}-\d{2}/.test(value)?value:null;
    const dated=rows.filter(row=>validDate(row.resource.valuation_date));
    const selected=view==="latest"?dated.filter(row=>row.resource.valuation_date===dated.map(item=>item.resource.valuation_date).sort().at(-1))
      :view==="missing-date"?rows.filter(row=>!validDate(row.resource.valuation_date)):rows;
    const heading={"gross-net":"Valores bruto e líquido dos investimentos",latest:"Investimento com posição mais recente","missing-date":"Investimentos sem data de avaliação",currency:"Investimentos separados por moeda"}[view];
    const lines=selected.slice(0,20).map(({bank,resource})=>`• ${safe(bank)} · ${safe(bankResourceName(resource.name))} · Bruto: ${bankMoney(resource.gross_amount,resource.currency)} · Líquido: ${bankMoney(resource.net_amount,resource.currency)} · Posição: ${bankDate(resource.valuation_date)}`);
    const empty=view==="latest"?"Nenhum investimento recebido tem data de avaliação informada.":"Nenhum investimento recebido está sem data de avaliação.";
    const currencies=[...new Set(selected.map(row=>row.resource.currency).filter((currency):currency is string=>!!currency))];
    return `${heading} · ${safe(modeLabel)}\n${lines.join("\n")||empty}${selected.length>20?`\nMais ${selected.length-20} investimento(s) em Contas.`:""}\n${view==="currency"?`Moedas recebidas: ${currencies.join(", ")||"não informadas"}. Valores de moedas diferentes não são somados entre si.`:"Valores ausentes permanecem desconhecidos; nenhuma posição foi estimada."} Isso não confirma que o banco tenha enviado todos os investimentos.${coverage}`;
  }
  if(question.kind==="loans"&&question.debtView){
    const view=question.debtView;
    const rows=connectedGroups.flatMap(group=>group.resources.filter(resource=>resource.resource_type==="loan")
      .filter(resource=>["balance","contracted","zero","exists","currency","missing-currency","by-bank","due-date"].includes(view)||!hasZeroBankDebt(resource,data))
      .map(resource=>({bank:group.name,resource,detail:data.credit.find(credit=>credit.resource_id===resource.id)})));
    const balanceUnits=(row:typeof rows[number]):bigint|null=>{
      const amount=String(row.detail?.outstanding_amount??"");
      if(!row.detail?.currency||!/^-?\d{1,16}(?:\.\d{1,8})?$/.test(amount))return null;
      const [whole,fraction=""]=amount.replace(/^-/ ,"").split(".");
      const units=BigInt(whole)*BigInt(100000000)+BigInt(fraction.padEnd(8,"0"));
      return amount.startsWith("-")?-units:units;
    };
    const coverage=`${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
    if(view==="exists"){
      const zero=rows.filter(row=>balanceUnits(row)===BigInt(0)).length;
      const banks=question.bankName?` · ${connectedGroups.map(group=>safe(group.name)).join(", ")}`:"";
      return `Empréstimos recebidos${banks} · ${safe(modeLabel)}\n${rows.length} ${rows.length===1?"contrato de empréstimo recebido":"contratos de empréstimo recebidos"} nos dados do banco.${zero?` ${zero} com saldo informado como zero.`:""} ${rows.length?"Isso não confirma que o contrato ainda esteja ativo nem que esteja quitado.":"A ausência nos dados não confirma que não exista empréstimo."}${coverage}`;
    }
    if(view==="currency"||view==="missing-currency"){
      const missing=rows.filter(row=>!row.detail?.currency);
      if(view==="missing-currency")return `Empréstimos sem moeda informada · ${safe(modeLabel)}\n${missing.length} ${missing.length===1?"contrato":"contratos"} fora do total por falta de moeda.\n${missing.slice(0,12).map(row=>`• ${safe(row.bank)} · ${safe(bankResourceName(row.resource.name))}`).join("\n")||"Nenhum contrato recebido ficou fora por falta de moeda."}${missing.length>12?`\nMais ${missing.length-12} contrato(s) em Contas.`:""}\nIsso não significa saldo zero; confira o banco.${coverage}`;
      const totals=bankAmountTotals(rows.map(row=>({amount:row.detail?.outstanding_amount,currency:row.detail?.currency})),!!data.truncated||missing.length>0);
      return `Saldos de empréstimos separados por moeda · ${safe(modeLabel)}\n${totals.join("\n")||"Nenhum saldo com valor e moeda informados para somar."}\n${missing.length} ${missing.length===1?"contrato":"contratos"} fora da soma por falta de moeda. Valores de moedas diferentes não são somados entre si; posições sem saldo informado também ficam fora.${coverage}`;
    }
    if(view==="by-bank"){
      const lines=connectedGroups.map(group=>{
        const ids=new Set(group.resources.map(resource=>resource.id));
        const bankRows=rows.filter(row=>ids.has(row.resource.id));
        if(!bankRows.length)return `• ${safe(group.name)}: nenhum empréstimo recebido`;
        const totals=bankAmountTotals(bankRows.map(row=>({amount:row.detail?.outstanding_amount,currency:row.detail?.currency})),!!data.truncated);
        return `• ${safe(group.name)}: ${bankRows.length} ${bankRows.length===1?"contrato":"contratos"}${totals.length?` · ${totals.join(" · ")}`:" · sem saldo devedor informado"}`;
      });
      return `Empréstimos por banco · ${safe(modeLabel)}\n${lines.join("\n")}\nBancos e moedas não são somados entre si. Saldo informado como zero não prova quitação.${coverage}`;
    }
    if(view==="due-date"){
      const lines=rows.slice(0,20).map(row=>`• ${safe(row.bank)} · ${safe(bankResourceName(row.resource.name))} · Vencimento final do contrato: ${bankDate(row.detail?.due_date)}`);
      return `Vencimento final dos empréstimos · ${safe(modeLabel)}\n${lines.join("\n")||"Nenhum contrato de empréstimo recebido."}${rows.length>20?`\nMais ${rows.length-20} contrato(s) em Contas.`:""}\nA data final do contrato não informa necessariamente a data de cada parcela; datas ausentes não foram estimadas.${coverage}`;
    }
    if(view==="max-balance"||view==="min-positive"){
      const byCurrency=new Map<string,Array<{row:typeof rows[number];units:bigint}>>();
      for(const row of rows){
        const units=balanceUnits(row),currency=row.detail?.currency;
        if(!currency||units===null||units<=BigInt(0)||bankMoney(row.detail?.outstanding_amount,currency)==="Não informado")continue;
        byCurrency.set(currency,[...(byCurrency.get(currency)??[]),{row,units}]);
      }
      const selected=[...byCurrency.values()].flatMap(items=>{
        const extreme=items.reduce((best,item)=>view==="max-balance"?(item.units>best.units?item:best):(item.units<best.units?item:best));
        return items.filter(item=>item.units===extreme.units).slice(0,5).map(item=>item.row);
      });
      return `${view==="max-balance"?"Maior saldo devedor":"Menor saldo devedor positivo"} por moeda · ${safe(modeLabel)}\n${selected.map(row=>`• ${safe(row.bank)} · ${safe(bankResourceName(row.resource.name))}: ${bankMoney(row.detail?.outstanding_amount,row.detail?.currency)}`).join("\n")||"Nenhum saldo devedor positivo e com moeda informada foi recebido."}\n${byCurrency.size>1?"Moedas diferentes foram comparadas separadamente. ":""}Saldos zero, negativos, sem valor ou sem moeda ficaram fora da comparação. Isso não confirma a situação contratual junto ao banco.${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
    }
    const selected=rows.filter(row=>view==="missing-next-installment"
      ? bankMoney(row.detail?.next_installment_amount,row.detail?.currency)==="Não informado"
      : view==="missing-due-date" ? bankDate(row.detail?.due_date)==="Não informado"
      : view==="zero" ? balanceUnits(row)===BigInt(0)
      : view==="positive" ? (balanceUnits(row)??BigInt(0))>BigInt(0) : true);
    const titles={balance:"Saldo devedor de cada empréstimo",contracted:"Valor contratado de cada empréstimo", "next-installment":"Próxima parcela de cada empréstimo", "missing-next-installment":"Empréstimos sem valor informado da próxima parcela", "missing-due-date":"Empréstimos sem vencimento final informado",zero:"Empréstimos com saldo devedor zero informado",positive:"Empréstimos com saldo devedor positivo informado"};
    const field=(row:typeof rows[number])=>view==="balance"?`Saldo devedor: ${bankMoney(row.detail?.outstanding_amount,row.detail?.currency)}`
      :view==="contracted"?`Valor contratado: ${bankMoney(row.detail?.contract_amount,row.detail?.currency)}`
      :view==="missing-due-date"?"Vencimento final: Não informado"
      :view==="zero"||view==="positive"?`Saldo devedor: ${bankMoney(row.detail?.outstanding_amount,row.detail?.currency)}`
      :`Valor da próxima parcela: ${bankMoney(row.detail?.next_installment_amount,row.detail?.currency)}`;
    const lines=selected.slice(0,12).map(row=>`• ${safe(row.bank)} · ${safe(bankResourceName(row.resource.name))} · ${field(row)}`);
    const empty=rows.length?"Nenhum dos empréstimos recebidos corresponde a esse filtro.":"Nenhum empréstimo foi recebido dos bancos conectados neste modo.";
    const caveat=view==="balance"||view==="zero"?"Saldo zero informado não confirma quitação contratual.":view==="positive"?"Saldo positivo informado não confirma que o contrato esteja ativo; confira o banco.":view==="contracted"?"O valor contratado é o valor original do contrato, não o saldo ainda devido.":"Valor ou data não informados permanecem desconhecidos; empréstimos com saldo zero informado ficaram fora dos filtros de próximas parcelas.";
    return `${titles[view]} · ${safe(modeLabel)} · ${selected.length} contrato(s)\n${lines.join("\n")||empty}${selected.length>12?`\nMais ${selected.length-12} contrato(s) em Contas.`:""}\n${caveat} Posição conforme os dados recebidos; contratos encerrados podem não aparecer.${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
  }
  if(question.kind==="coverage"){
    const missing=connectedGroups.flatMap(group=>[
      ...(!group.resources.some(resource=>resource.resource_type==="account")?[`• ${safe(group.name)} não enviou dados de conta; saldo disponível não pôde ser avaliado.`]:[]),
      ...group.resources.flatMap(resource=>{
      const name=`${safe(group.name)} · ${safe(bankResourceName(resource.name))}${resource.identification_last4?` · final ${safe(resource.identification_last4)}`:""}`;
      if(resource.resource_type==="account")return bankMoney(resource.available_amount,resource.currency)==="Não informado"?[`• ${name}: saldo disponível não informado (posição: ${bankDate(resource.synced_at)}).`]:[];
      if(resource.resource_type!=="card")return [];
      const limits=displayCardLimits(data.limits.filter(limit=>limit.resource_id===resource.id));
      if(!limits.length)return [`• ${name}: limite disponível não informado (posição: ${bankDate(resource.synced_at)}).`];
      return limits.filter(limit=>bankMoney(limit.available_amount,limit.currency)==="Não informado")
        .map(limit=>`• ${name} · ${safe(limit.line_name??"Linha de crédito")}: limite disponível não informado (posição: ${bankDate(resource.synced_at)}).`);
      }),
    ]);
    return `Saldos e limites que ainda não vieram completos · ${safe(modeLabel)}\n${missing.slice(0,15).join("\n")||"Todas as contas e linhas de cartão recebidas têm valor disponível informado."}${missing.length>15?`\nMais ${missing.length-15} item(ns) em Contas.`:""}\nIsso descreve apenas os dados recebidos; não confirma saldo zero, limite zero nem prazo de atualização do banco.${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
  }
  if(question.kind==="balances"&&question.balanceFilter){
    const missing=question.balanceFilter==="missing";
    const accounts=connectedGroups.flatMap(group=>group.resources.filter(resource=>resource.resource_type==="account"&&(
      missing?bankMoney(resource.available_amount,resource.currency)==="Não informado":
        bankMoney(resource.available_amount,resource.currency)!=="Não informado"&&Number(resource.available_amount)<0
    )).map(resource=>`• ${safe(group.name)} · ${safe(bankResourceName(resource.name))}${missing?"":`: ${bankMoney(resource.available_amount,resource.currency)}`}`));
    const heading=missing?"Contas sem saldo disponível informado":"Contas com saldo negativo informado";
    const empty=missing?"Nenhuma conta recebida sem saldo informado foi identificada.":"Nenhuma conta com saldo negativo foi identificada nos dados recebidos.";
    const banksWithoutAccounts=missing?connectedGroups.filter(group=>!group.resources.some(resource=>resource.resource_type==="account")).map(group=>safe(group.name)):[];
    const bankNotice=banksWithoutAccounts.length?`\nBancos que não enviaram dados de conta: ${banksWithoutAccounts.slice(0,20).join(", ")}.${banksWithoutAccounts.length>20?` Mais ${banksWithoutAccounts.length-20} banco(s) em Contas.`:""}`:"";
    return `${heading} · ${safe(modeLabel)}\n${accounts.slice(0,20).join("\n")||empty}${accounts.length>20?`\nMais ${accounts.length-20} conta(s) em Contas.`:""}${bankNotice}\nPosição conforme os dados recebidos; ausência de dados não confirma saldo zero.${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
  }
  if(question.kind==="limits"&&question.limitView==="shared"){
    const groups=connectedGroups.map(group=>({name:group.name,count:group.resources.filter(resource=>resource.resource_type==="card")
      .flatMap(resource=>displayCardLimits(data.limits.filter(limit=>limit.resource_id===resource.id)))
      .filter(limit=>normalizeBankText(limit.consolidation_type??"")==="consolidado").length})).filter(group=>group.count>0);
    const total=groups.reduce((sum,group)=>sum+group.count,0);
    const details=groups.slice(0,8).map(group=>`• ${safe(group.name)}: ${group.count} ${group.count===1?"linha consolidada":"linhas consolidadas"}`).join("\n");
    return `Linhas de crédito consolidadas · ${safe(modeLabel)}\n${total?`${total} ${total===1?"linha marcada":"linhas marcadas"} como CONSOLIDADO nos dados recebidos.\n${details}${groups.length>8?`\nMais ${groups.length-8} banco(s) em Contas.`:""}`:"Não identifiquei linhas marcadas como CONSOLIDADO nos dados recebidos."}\nOs dados recebidos não informam quais cartões compartilham exatamente a mesma linha. Por isso, a Zelo não soma os limites; linhas consolidadas não comprovam crédito adicional independente.${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
  }
  if(question.kind==="limits"&&question.limitView==="inconsistent"){
    const lines=connectedGroups.flatMap(group=>group.resources.filter(resource=>resource.resource_type==="card")
      .flatMap(resource=>displayCardLimits(data.limits.filter(limit=>limit.resource_id===resource.id))
        .filter(cardLimitAmountsDisagree).map(limit=>`• ${safe(group.name)} · ${safe(bankResourceName(resource.name))}${resource.identification_last4?` · final ${safe(resource.identification_last4)}`:""} · ${safe(limit.line_name??"Linha de crédito")}\nTotal: ${bankMoney(limit.total_amount,limit.currency)} · Utilizado: ${bankMoney(limit.used_amount,limit.currency)} · Disponível: ${bankMoney(limit.available_amount,limit.currency)}`)));
    return `Limites com valores que não fecham · ${safe(modeLabel)}\n${lines.length?`${lines.length} ${lines.length===1?"linha recebida precisa":"linhas recebidas precisam"} de conferência:\n${lines.slice(0,10).join("\n")}${lines.length>10?`\nMais ${lines.length-10} linha(s) em Contas.`:""}`:"Nenhuma linha recebida com total, utilizado e disponível informados apresentou divergência."}\nA Zelo preservou os números recebidos; confirme as divergências no banco. Linhas sem algum desses valores não puderam ser conferidas.${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
  }
  if(question.kind==="limits"&&(question.limitView==="max-available"||question.limitView==="min-available")){
    const candidates=connectedGroups.flatMap(group=>group.resources.filter(resource=>resource.resource_type==="card")
      .flatMap(resource=>{
        const limit=headlineCardLimit(displayCardLimits(data.limits.filter(line=>line.resource_id===resource.id)));
        const raw=String(limit?.available_amount??"");
        if(!limit?.currency||bankMoney(limit.available_amount,limit.currency)==="Não informado"||!/^-?\d{1,16}(\.\d{1,8})?$/.test(raw))return [];
        const [whole,fraction=""]=raw.replace(/^-/,"").split(".");
        const units=(BigInt(whole)*BigInt(100000000)+BigInt(fraction.padEnd(8,"0")))*(raw.startsWith("-")?BigInt(-1):BigInt(1));
        return [{bank:group.name,card:resource,limit,units}];
      }));
    const byCurrency=new Map<string,typeof candidates>();
    for(const candidate of candidates){const currency=candidate.limit.currency!;byCurrency.set(currency,[...(byCurrency.get(currency)??[]),candidate]);}
    const highest=question.limitView==="max-available";
    const lines=[...byCurrency.values()].flatMap(items=>{
      const selected=items.reduce((best,item)=>highest?(item.units>best.units?item:best):(item.units<best.units?item:best));
      return items.filter(item=>item.units===selected.units).slice(0,5).map(item=>`• ${safe(item.bank)} · ${safe(bankResourceName(item.card.name))}${item.card.identification_last4?` · final ${safe(item.card.identification_last4)}`:""} · ${safe(item.limit.line_name??"Linha de crédito")}: ${bankMoney(item.limit.available_amount,item.limit.currency)}`);
    });
    return `${highest?"Maior":"Menor"} limite disponível recebido por cartão · ${safe(modeLabel)}\n${lines.join("\n")||"Nenhum cartão com limite disponível informado foi recebido."}\nA comparação usa uma linha representativa por cartão, sem somar linhas que podem compartilhar crédito.${byCurrency.size>1?" Moedas diferentes foram comparadas separadamente.":""} Valores não informados ficaram fora da comparação.${data.truncated?" Consulta parcial: há dados além do limite recebido.":""}${data.sync.some(sync=>sync.status!=="complete")?" Há uma importação pendente ou com falha.":""}`;
  }
  const labels = { loans: "Empréstimos", financings: "Financiamentos", limits: "Crédito dos cartões", balances: "Saldos bancários", investments: "Investimentos", bills: "Faturas", spending: "Gastos", coverage: "Dados bancários" };
  const debt = question.kind === "loans" || question.kind === "financings";
  const wantedDebtType = question.kind === "loans" ? "loan" : "financing";
  const limitGroups = question.limitView ? connectedGroups.map(group => ({...group, resources: group.resources.filter(resource => resource.resource_type === "card" && (
    question.limitView === "used" || displayCardLimits(data.limits.filter(limit => limit.resource_id === resource.id))
      .some(limit => bankMoney(limit.available_amount,limit.currency) !== "Não informado")
  ))})).filter(group => group.resources.length) : [];
  const groups = question.limitView ? limitGroups : question.settledOnly
    ? connectedGroups.filter(group => group.resources.some(resource => resource.resource_type === "loan" && hasZeroBankDebt(resource,data)))
    : question.kind === "investments"
    ? connectedGroups.filter(group => group.resources.some(resource => resource.resource_type === "investment"))
    : debt && question.keyword
    ? connectedGroups.filter(group => group.resources.some(resource => resource.resource_type === wantedDebtType && matchesBankDebtPurpose(resource, question.keyword)))
    : connectedGroups;
  if (!groups.length) return question.limitView
    ? `Nenhum cartão ${question.limitView === "available-known" ? "com limite disponível informado" : "com dados de limite"} foi recebido em ${safe(modeLabel)}. Isso não confirma ausência de cartões; confira Contas e o banco.`
    : question.settledOnly
    ? `Não identifiquei empréstimos com saldo devedor informado como zero nos dados recebidos em ${safe(modeLabel)}. Isso não confirma que não haja contratos quitados; confira o banco.`
    : question.kind === "investments"
    ? `Nenhum investimento informado pelos bancos conectados em ${safe(modeLabel)}. Isso não confirma ausência de investimentos; confira cada banco.${data.truncated ? " Consulta parcial: há dados além do limite recebido." : ""}${data.sync.some(s => s.status !== "complete") ? " Há uma importação pendente ou com falha." : ""}`
    : `Não encontrei contrato correspondente a ${safe(question.keyword ?? "essa busca")} nos dados recebidos em ${safe(modeLabel)}. Isso não confirma ausência de dívida; confira também o banco. ${data.truncated ? "Consulta parcial: há dados além do limite recebido. " : ""}${data.sync.some(s => s.status !== "complete") ? "Há uma importação pendente ou com falha." : ""}`.trim();
  const received: Amount[] = [];
  let incomplete = !!data.truncated;
  let omitted = false;
  let shownDebtCount = 0;
  const blocks = groups.map(group => {
    const wanted = { loans: "loan", financings: "financing", limits: "card", balances: "account", investments: "investment", bills: "card", spending: "account", coverage: "account" }[question.kind];
    const candidates = group.resources.filter(r => r.resource_type === wanted && (!debt || matchesBankDebtPurpose(r, question.keyword)));
    const resources = candidates.filter(r => question.settledOnly ? hasZeroBankDebt(r,data) : !debt || !hasZeroBankDebt(r, data));
    if (debt) shownDebtCount += resources.length;
    const hiddenZero = candidates.length - resources.length;
    const lines: string[] = [];
    const bankAmounts: Amount[] = candidates.filter(r => debt && hasZeroBankDebt(r, data)).map(r => ({ amount: "0", currency: data.credit.find(c => c.resource_id === r.id)?.currency }));
    for (const resource of resources) {
      const name = `${safe(bankResourceName(resource.name))}${resource.identification_last4 ? ` · final ${safe(resource.identification_last4)}` : ""}`;
      if (debt) {
        const detail = data.credit.find(c => c.resource_id === resource.id);
        const amount = { amount: detail?.outstanding_amount, currency: detail?.currency };
        bankAmounts.push(amount);
        const installment = detail?.next_installment_amount == null
          ? "Valor da próxima parcela não informado pelo banco"
          : `Valor da próxima parcela: ${bankMoney(detail.next_installment_amount, detail.currency)}`;
        lines.push(question.settledOnly ? `${name}\nSaldo devedor informado: ${bankMoney(amount.amount,amount.currency)}` : `${name}\nSaldo devedor: ${bankMoney(amount.amount, amount.currency)}\nContratado: ${bankMoney(detail?.contract_amount, detail?.currency)} · ${installment}\nVencimento final: ${bankDate(detail?.due_date)}`);
      } else if (question.kind === "limits") {
        const limits = displayCardLimits(data.limits.filter(l => l.resource_id === resource.id))
          .filter(limit => question.limitView !== "available-known" || bankMoney(limit.available_amount,limit.currency) !== "Não informado");
        if (!limits.length) lines.push(question.limitView === "used" ? `${name} · Utilizado: Não informado pelo banco.` : `${name} · Limite não informado pelo banco.`);
        for (const limit of limits) {
          const heading = `${name} · ${safe(limit.line_name ?? "Linha de crédito")}${limit.consolidation_type ? ` · ${safe(limit.consolidation_type)}` : ""}`;
          const amounts = question.limitView === "used"
            ? `Utilizado: ${bankMoney(limit.used_amount,limit.currency)}`
            : `Disponível: ${bankMoney(limit.available_amount, limit.currency)}\nTotal: ${bankMoney(limit.total_amount, limit.currency)} · Utilizado: ${bankMoney(limit.used_amount, limit.currency)}`;
          lines.push(`${heading}\n${amounts}${cardLimitAmountsDisagree(limit) ? "\n⚠️ Os valores desta linha não fecham entre si; confirme o limite no banco." : ""}`);
        }
      } else if (question.kind === "balances") {
        bankAmounts.push({ amount: resource.available_amount, currency: resource.currency });
        lines.push(`${name} · Saldo disponível: ${bankMoney(resource.available_amount, resource.currency)}`);
      } else if (question.kind === "investments") {
        lines.push(`${name} · Bruto: ${bankMoney(resource.gross_amount, resource.currency)} · Líquido: ${bankMoney(resource.net_amount, resource.currency)} · Posição: ${bankDate(resource.valuation_date)}`);
      } else if (question.kind === "bills") {
        const bills = data.bills.filter(b => b.resource_id === resource.id).sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));
        if (!bills.length) lines.push(`${name} · Faturas não informadas pelo banco.`);
        for (const bill of bills) lines.push(`${name} · Vencimento: ${bankDate(bill.due_date)}\nTotal: ${bankMoney(bill.total_amount, bill.currency)} · Mínimo: ${bankMoney(bill.minimum_payment_amount, bill.currency)} · Pagamento: ${bill.status === "unknown" ? "não informado" : safe(bill.status)}`);
      }
    }
    if (!candidates.length) incomplete = true;
    received.push(...bankAmounts);
    omitted ||= lines.length > 10;
    const dates = [...new Set(resources.map(r => r.synced_at).filter(Boolean))].sort();
    const empty = hiddenZero ? "Não há saldo devedor pendente nos contratos recebidos." : question.keyword ? `Nenhum contrato correspondente a ${safe(question.keyword)} nos dados recebidos.` : `O banco ainda não informou ${labels[question.kind].toLowerCase()}.`;
    const receivedFrom = dates.length ? bankDate(dates[0]) : "";
    const receivedTo = dates.length ? bankDate(dates.at(-1)) : "";
    return `*${safe(group.name)}*${debt && resources.length ? ` · ${resources.length} operação(ões) recebida(s)` : ""}\n\n${lines.slice(0, 10).join("\n\n") || empty}${!question.settledOnly&&groups.length>1&&resources.length>1&&bankAmounts.length ? `\n\n${bankAmountTotals(bankAmounts, !!data.truncated).join("\n")}` : ""}${lines.length > 10 ? `\nMais ${lines.length - 10} registro(s); veja os detalhes em Contas.` : ""}${dates.length ? `\nRecebido em ${receivedFrom}${receivedFrom !== receivedTo ? ` a ${receivedTo}` : ""}.` : ""}`;
  });
  const title = question.latestSnapshot && question.kind === "balances"
    ? "Saldos bancários da última posição recebida"
    : question.settledOnly ? "Empréstimos com saldo informado como zero" : `${labels[question.kind]} recebidos`;
  let result = `${title} · ${safe(modeLabel)}${question.keyword ? `\n🔎 Contrato: ${safe(question.keyword)}` : ""}\n\n${blocks.join("\n\n")}`;
  if ((question.kind === "balances" || debt && shownDebtCount !== 1) && !question.settledOnly) result += `\n\n${bankAmountTotals(received, incomplete).join("\n") || "Total não informado pelos bancos."}`;
  if(question.settledOnly)result += "\nSaldo zero recebido não confirma quitação contratual; confirme com o banco. Contratos já encerrados podem não aparecer nos dados recebidos.";
  if (question.kind === "limits") result += "\n\nLinhas e limites compartilhados não são somados. Crédito disponível não é saldo em conta.";
  result += "\nValores não informados permanecem desconhecidos. Posição conforme os dados recebidos de cada banco; ausência de dados não confirma valor zero.";
  if (data.truncated) result += " Consulta parcial: há dados além do limite recebido; consulte Contas.";
  if (omitted) result += " Detalhes adicionais ficam em Contas; os totais conhecidos incluem todas as operações recebidas.";
  if (data.sync.some(s => s.status !== "complete")) result += " Há uma importação pendente ou com falha.";
  return result;
}
