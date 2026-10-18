import UiIcon from "@/components/UiIcon";
import s from "./landing.module.css";

const DATA = [
  ["Contas e movimentações", "Saldos e transações recebidos dos bancos, organizados para consulta e análise do período."],
  ["Cartões e faturas", "Limites, faturas e compras do cartão, com as parcelas e informações que a instituição disponibilizar."],
  ["Investimentos", "Produtos e posições compartilhados, com os saldos e detalhes recebidos da instituição."],
  ["Empréstimos e financiamentos", "Contratos, saldo devedor, parcelas e condições de crédito informadas pelo banco."],
] as const;

export default function OpenFinanceSection() {
  return <section id="open-finance" className={s.openFinance}>
    <div className={s.sectionInner}>
      <div className={s.openFinanceGrid}>
        <div className={s.openFinanceCopy}>
          <p className={s.eyebrow}>OPEN FINANCE / BANCOS CONECTADOS</p>
          <h2>Seus bancos.<br /><em>Uma visão do<br />{" "}seu dinheiro.</em></h2>
          <p>Traga para o Zelo os dados que você autorizar compartilhar. Acompanhe contas, cartões, investimentos e operações de crédito no painel e consulte as informações pelo WhatsApp.</p>
          <div className={s.openFinanceData}>{DATA.map(([title, description]) => <div key={title}><span>↗</span><h3>{title}</h3><p>{description}</p></div>)}</div>
        </div>
        <div className={s.bankShowcase} role="img" aria-label="Exemplo ilustrativo de visão bancária no Zelo: conta com saldo de R$ 8.450, cartão com fatura de R$ 1.280 e investimentos de R$ 12.400. Os números são fictícios.">
          <div className={s.bankShowcaseTop}><span><UiIcon name="finance" />ZELO / OPEN FINANCE</span><small>EXEMPLO ILUSTRATIVO</small></div>
          <div className={s.bankScope}><span>Pessoal</span><b>Visão dos seus bancos</b><small>Dados autorizados, no mesmo contexto.</small></div>
          <div className={s.bankBalance}><small>SALDO RECEBIDO DA INSTITUIÇÃO</small><strong>R$ 8.450<span>,00</span></strong><p><i />Conta bancária · dados de exemplo</p></div>
          <div className={s.bankProductRow}><div><UiIcon name="wallet" /><span>Cartão de crédito<small>Fatura do período</small></span></div><b>R$ 1.280,00</b></div>
          <div className={s.bankProductRow}><div><UiIcon name="finance" /><span>Investimentos<small>Posição recebida</small></span></div><b>R$ 12.400,00</b></div>
          <div className={s.bankProductRow}><div><UiIcon name="document" /><span>Operação de crédito<small>Taxa não enviada no exemplo</small></span></div><b className={s.bankMissing}>Não informado</b></div>
          <div className={s.bankQuestion}><UiIcon name="spark" /><div><small>VOCÊ TAMBÉM PODE PERGUNTAR</small><p>“Como estão meus saldos e faturas?”</p></div></div>
          <p className={s.bankDemoNote}>Demonstração com dados fictícios. Os valores reais dependem das informações autorizadas e recebidas dos seus bancos.</p>
        </div>
      </div>
      <div className={s.bankHowHeader}><h3>Como a conexão funciona</h3><p>O compartilhamento começa com a sua autorização.</p></div>
      <ol className={s.bankSteps}>
        <li><span>01</span><h3>Escolha o banco no painel</h3><p>Abra <b>Contas → Conectar banco</b>. Use Pessoal para contas PF e o espaço Empresa para contas PJ, conforme o acesso disponível na sua conta.</p></li>
        <li><span>02</span><h3>Confira e autorize no banco</h3><p>Revise as informações e permissões. A conexão é feita com a Celcoin, e a autenticação acontece na instituição. <b>O Zelo não pede sua senha bancária.</b></p></li>
        <li><span>03</span><h3>Acompanhe os dados recebidos</h3><p>Depois da confirmação, consulte no painel ou no WhatsApp vinculado à conta. Acompanhe o estado da conexão e gerencie as permissões pelo caminho disponível no painel.</p></li>
      </ol>
      <div className={s.bankAvailability}><UiIcon name="wallet" /><p>Open Finance para contas bancárias do Brasil, conforme disponibilidade na sua conta, plano e instituição. Produtos, histórico, campos e atualização variam conforme os dados compartilhados. Uma informação não enviada aparece como “não informado”; ela não é tratada como zero. Você pode solicitar a revogação do compartilhamento em Conexões e permissões.</p></div>
    </div>
  </section>;
}
