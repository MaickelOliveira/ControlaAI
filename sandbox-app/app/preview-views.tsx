import { useEffect, useRef } from "react";
import type { PolpRecord, PolpSnapshot } from "@/lib/polp-sandbox";
import { formatPolpDate } from "@/lib/polp-date";
import { money, recordValue, text } from "./preview-model";

type Props = {snapshot:PolpSnapshot;onDetail:(title:string,record:PolpRecord)=>void};
const investmentLabels:Record<string,string> = {"bank-fixed-incomes":"Renda fixa bancária","credit-fixed-incomes":"Renda fixa de crédito",funds:"Fundos","treasure-titles":"Tesouro Direto","variable-incomes":"Renda variável"};

function RecordButton({title,record,onDetail}:{title:string;record:PolpRecord;onDetail:Props["onDetail"]}) {
  return <button className="preview-link" onClick={()=>onDetail(title,record)}>Ver todos os detalhes →</button>;
}

export function CardsView({snapshot,onDetail}:Props) {
  return <>
    <div className="preview-section-heading"><h2>Seus cartões</h2><span>{snapshot.cardTransactions.length} compras e movimentações recebidas</span></div>
    <div className="preview-account-grid">{snapshot.cards.map(card=><article className="preview-account" key={card.id}>
      <div className="preview-account-top"><span className="preview-card-symbol">▰</span><span className="preview-tag green">Conectado</span></div>
      <h3>{card.name}</h3><p>{card.credit_card_network || "Bandeira não informada"}</p>
      {card.limits?.length ? card.limits.map((limit,index)=><div key={index}>
        <span className="preview-small-label">Limite disponível {card.limits!.length>1 ? `· linha ${index+1}` : ""}</span>
        <strong className="preview-account-balance">{money(limit.available_amount)}</strong>
        <dl className="preview-credit-facts"><div><dt>Limite total</dt><dd>{money(recordValue(limit,"limit_amount"))}</dd></div><div><dt>Valor utilizado</dt><dd>{money(limit.used_amount)}</dd></div></dl>
      </div>) : <p>Limites ainda não informados pelo banco.</p>}
      <p>Data dos dados: {formatPolpDate(text(recordValue(card,"updated_at")))}</p>
      <p>{snapshot.cardTransactions.filter(tx=>tx.cardId===card.id).length} lançamentos</p>
      <RecordButton title={card.name} record={card as unknown as PolpRecord} onDetail={onDetail}/>
    </article>)}</div>
    <section className="preview-table-card"><div className="preview-section-heading"><div><h2>Faturas recebidas</h2><p>As compras e a quitação da fatura terão tratamentos diferentes na conferência.</p></div></div><div className="preview-table-scroll"><table><thead><tr><th>Cartão</th><th>Vencimento</th><th>Total da fatura</th><th>Pagamento mínimo</th><th>Detalhes</th></tr></thead><tbody>{snapshot.bills.map(bill=><tr key={bill.id}><td><strong>{snapshot.cards.find(card=>card.id === bill.credit_card_id)?.name || "Cartão"}</strong></td><td>{formatPolpDate(text(bill.due_date))}</td><td>{money(bill.bill_total_amount)}</td><td>{money(bill.bill_minimum_amount)}</td><td><RecordButton title="Detalhes da fatura" record={bill} onDetail={onDetail}/></td></tr>)}</tbody></table></div>{!snapshot.bills.length && <p className="preview-empty">Nenhuma fatura disponibilizada nesta conexão.</p>}</section>
    <section className="preview-table-card"><div className="preview-section-heading"><h2>Compras e parcelas do cartão</h2><span>{snapshot.cardTransactions.length} lançamentos</span></div><div className="preview-table-scroll preview-scroll-list"><table><thead><tr><th>Descrição</th><th>Data</th><th>Parcela</th><th>Valor</th><th>Detalhes</th></tr></thead><tbody>{snapshot.cardTransactions.map(tx=><tr key={`${tx.cardId}:${tx.id}`}><td><strong>{tx.transaction_name}</strong><small>{snapshot.cards.find(card=>card.id===tx.cardId)?.name}</small></td><td>{formatPolpDate(tx.transaction_date_time)}</td><td>{tx.charge_identificator && tx.charge_number ? `${tx.charge_identificator}/${tx.charge_number}` : "—"}</td><td>{tx.credit_debit_type === "CREDITO" ? "+ " : "− "}{money(tx.brazilian_amount)}</td><td><RecordButton title={tx.transaction_name} record={tx as unknown as PolpRecord} onDetail={onDetail}/></td></tr>)}</tbody></table></div></section>
  </>;
}

export function InvestmentsView({snapshot,onDetail}:Props) {
  return <>
    <div className="preview-section-heading"><div><h2>Seus investimentos</h2><p>Posições apresentadas por produto. Aplicações e resgates ficam separados das despesas de consumo.</p></div></div>
    {Object.entries(snapshot.investments).map(([type,items])=><section className="preview-investment-group" key={type}><div className="preview-section-heading"><h3>{investmentLabels[type] || type}</h3><span>{items.length} produtos</span></div><div className="preview-account-grid">{items.map(investment=>{
      const title=text(recordValue(investment,"name","ticker","investment_type","treasure_title_type","product.name","product.ticker") || investmentLabels[type]);
      return <article key={investment.id} className="preview-account"><span className="preview-tag">{investmentLabels[type]}</span><h3>{title}</h3><p>Posição bruta informada</p><strong className="preview-account-balance">{money(recordValue(investment,"balance.gross_amount","balance.updated_amount"))}</strong><p>Posição líquida: {money(recordValue(investment,"balance.net_amount"))}</p><p>Data da posição: {formatPolpDate(text(recordValue(investment,"balance.reference_date_time","balance.reference_date")))}</p><p>{snapshot.investmentTransactions[`${type}:${investment.id}`]?.length || 0} movimentações</p><RecordButton title={title} record={investment} onDetail={onDetail}/></article>;
    })}</div>{!items.length && <p className="preview-empty">Nenhum produto desta categoria foi disponibilizado.</p>}</section>)}
    <section className="preview-table-card"><div className="preview-section-heading"><h2>Movimentações dos investimentos</h2><span>{Object.values(snapshot.investmentTransactions).reduce((sum,items)=>sum+items.length,0)} registros</span></div><div className="preview-table-scroll preview-scroll-list"><table><thead><tr><th>Movimentação</th><th>Categoria</th><th>Data</th><th>Valor bruto</th><th>Detalhes</th></tr></thead><tbody>{Object.entries(snapshot.investmentTransactions).flatMap(([key,items])=>items.map(tx=><tr key={`${key}:${tx.id}`}><td><strong>{text(recordValue(tx,"transaction_type","type"))}</strong></td><td>{investmentLabels[key.split(":")[0]]}</td><td>{formatPolpDate(text(recordValue(tx,"transaction_date","transaction_date_time")))}</td><td>{money(recordValue(tx,"transaction_gross_value","transaction_amount"))}</td><td><RecordButton title="Movimentação do investimento" record={tx} onDetail={onDetail}/></td></tr>))}</tbody></table></div></section>
  </>;
}

export function CreditView({snapshot,onDetail}:Props) {
  return <>{[{title:"Empréstimos",items:snapshot.loans},{title:"Financiamentos",items:snapshot.financings}].map(group=><section key={group.title} className="preview-investment-group"><div className="preview-section-heading"><h2>{group.title}</h2><span>{group.items.length} contratos</span></div><div className="preview-account-grid">{group.items.map(credit=>{
    const title=text(recordValue(credit,"product_name","contract.product_name"));
    return <article key={credit.id} className="preview-account"><span className="preview-tag">{group.title}</span><h3>{title}</h3><p>Saldo devedor informado</p><strong className="preview-account-balance">{money(recordValue(credit,"payments.contract_outstanding_balance"))}</strong><dl className="preview-credit-facts"><div><dt>Valor contratado</dt><dd>{money(recordValue(credit,"contract_amount","contract.contract_amount"))}</dd></div><div><dt>Próxima parcela informada</dt><dd>{money(recordValue(credit,"next_instalment_amount","contract.next_instalment_amount"))}</dd></div><div><dt>Parcelas pagas</dt><dd>{text(recordValue(credit,"scheduled_instalments.paid_instalments","payments.paid_instalments"))}</dd></div><div><dt>Parcelas restantes</dt><dd>{text(recordValue(credit,"scheduled_instalments.contract_remaining_number"))}</dd></div><div><dt>Vencimento do contrato</dt><dd>{formatPolpDate(text(recordValue(credit,"due_date","contract.due_date")))}</dd></div></dl><RecordButton title={title} record={credit} onDetail={onDetail}/></article>;
  })}</div>{!group.items.length && <p className="preview-empty">Nenhum contrato disponibilizado nesta conexão.</p>}</section>)}</>;
}

const labels:Record<string,string> = {
  name:"Nome",number:"Número",branch_code:"Agência",balance:"Saldo",available_amount:"Valor disponível",reserved_name:"Nome da reserva",reserved_identification:"Identificação da reserva",remuneration:"Remuneração",currency:"Moeda",amount:"Valor",limits:"Limites",used_amount:"Valor utilizado",limit_amount:"Limite total",unbilled_amount:"Valor ainda não faturado",payments:"Pagamentos",paid_instalments:"Parcelas pagas",contract_outstanding_balance:"Saldo devedor",releases:"Pagamentos realizados",paidDate:"Data do pagamento",paidAmount:"Valor pago",contract:"Contrato",contract_amount:"Valor contratado",contract_date:"Data do contrato",contract_number:"Número do contrato",next_instalment_amount:"Próxima parcela",due_date:"Vencimento",first_instalment_due_date:"Vencimento da primeira parcela",product_name:"Produto",product_type:"Tipo do produto",product_sub_type:"Modalidade",scheduled_instalments:"Parcelas",total_number_of_instalments:"Total de parcelas",contract_remaining_number:"Parcelas restantes",past_due_instalments:"Parcelas vencidas",interest_rates:"Taxas de juros",contracted_fees:"Tarifas contratadas",contracted_finance_charges:"Encargos contratados",warranties:"Garantias",cet:"Custo efetivo total",pre_fixed_rate:"Taxa prefixada",post_fixed_indexer_percentage:"Percentual do indexador",post_fixed_rate:"Taxa pós-fixada",indexer:"Indexador",product:"Identificação do produto",quantity:"Quantidade",reference_date_time:"Data da posição",gross_amount:"Valor bruto",net_amount:"Valor líquido",income_tax:"Imposto de renda",financial_transaction_tax:"IOF",blocked_balance:"Saldo bloqueado",updated_unit_price:"Preço unitário atualizado",purchase_unit_price:"Preço unitário de compra",issue_unit_price:"Preço unitário de emissão",investment_type:"Tipo do investimento",grace_period_date:"Fim da carência",purchase_date:"Data da compra",issue_date:"Data da emissão",bill_total_amount:"Total da fatura",bill_minimum_amount:"Pagamento mínimo",bill_closing_date:"Fechamento da fatura",finance_charges:"Encargos financeiros",credit_card_network:"Bandeira",identification:"Identificação",payment_methods:"Identificação do cartão",identification_number:"Final do cartão",transaction_name:"Descrição",transaction_date_time:"Data da movimentação",transaction_date:"Data da movimentação",transaction_amount:"Valor",brazilian_amount:"Valor em reais",credit_debit_type:"Entrada ou saída",transaction_type:"Tipo da movimentação",transaction_quantity:"Quantidade",transaction_gross_value:"Valor bruto",transaction_net_value:"Valor líquido",transaction_unit_price:"Preço unitário",charge_identificator:"Parcela atual",charge_number:"Total de parcelas",category_ref:"Categoria",bill_forecast_date:"Previsão da fatura",ticker:"Código do ativo",cnpj_number:"CNPJ",rate_periodicity:"Periodicidade da taxa",fee_name:"Tarifa",fee_amount:"Valor da tarifa",fee_rate:"Percentual da tarifa",settlement_date:"Data de liquidação",disbursement_dates:"Datas de liberação",anbima_category:"Categoria ANBIMA",anbima_class:"Classe ANBIMA",anbima_subclass:"Subclasse ANBIMA",type:"Tipo",
};
const hiddenKeys = new Set(["id","consent_id","account_id","credit_card_id","bank_fixed_income_id","credit_fixed_income_id","fund_id","treasure_title_id","variable_income_id","created_at","updated_at","cardId","accountId"]);
function Details({value,depth=0}:{value:unknown;depth?:number}) {
  if (value === null || value === undefined) return <span className="preview-detail-muted">Não informado</span>;
  if (typeof value === "boolean") return <span>{value ? "Sim" : "Não"}</span>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  if (depth>8) return <span>Detalhamento adicional indisponível nesta prévia.</span>;
  if ("amount" in value && "currency" in value) return <span>{money(value)}</span>;
  if (Array.isArray(value)) return value.length ? <div className="preview-detail-array">{value.map((item,index)=><div key={index}><Details value={item} depth={depth+1}/></div>)}</div> : <span className="preview-detail-muted">Nenhum registro</span>;
  return <dl className="preview-detail-list">{Object.entries(value).filter(([key])=>!hiddenKeys.has(key)).map(([key,item])=><div key={key}><dt>{labels[key] || key.replace(/_/g," ")}</dt><dd><Details value={item} depth={depth+1}/></dd></div>)}</dl>;
}

export function DetailDialog({title,record,onClose}:{title:string;record:PolpRecord;onClose:()=>void}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>previous?.focus();},[]);
  return <div className="preview-modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="detail-title" className="preview-modal wide" onKeyDown={event=>{if(event.key === "Escape") onClose();}}><button ref={close} className="preview-modal-close" aria-label="Fechar detalhes" onClick={onClose}>×</button><span className="preview-tag">Dados fictícios do banco</span><h2 id="detail-title">{title}</h2><p>Todos os detalhes recebidos para este item na conexão de teste.</p><div className="preview-detail-scroll"><Details value={record}/></div></section></div>;
}
