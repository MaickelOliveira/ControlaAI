import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import ProductCapture from "./ProductCapture";
import OpenFinanceJourney from "./OpenFinanceJourney";
import x from "./experience.module.css";
import s from "./landing.module.css";

const BANKS = [["nubank", "Nubank"], ["inter", "Inter"], ["bradesco", "Bradesco"], ["banco-do-brasil", "Banco do Brasil"], ["santander", "Santander"], ["caixa", "Caixa"], ["sicredi", "Sicredi"]] as const;

const DATA = [
  ["Contas e movimentações", "Saldos e transações recebidos dos bancos, organizados para consulta e análise do período."],
  ["Cartões e faturas", "Limites, faturas e compras do cartão, com as parcelas e informações que a instituição disponibilizar."],
  ["Investimentos", "Produtos e posições compartilhados, com os saldos e detalhes recebidos da instituição."],
  ["Empréstimos e financiamentos", "Contratos, saldo devedor, parcelas e condições de crédito informadas pelo banco."],
] as const;

export default function OpenFinanceSection() {
  return <section id="open-finance" className={s.openFinance}>
    <div className={s.sectionInner}>
      <div className={x.bankingIntro}><div><p className={s.eyebrow}>OPEN FINANCE / BANCOS CONECTADOS</p><h2>Seu dinheiro merece<br /><em>uma visão inteira.</em></h2></div><div><p>O saldo está em um banco. O cartão, em outro. Com a sua autorização, o Zelo reúne os dados recebidos para você consultar as informações no painel e pelo WhatsApp.</p><div className={x.bankConsent}><span>✓</span><p><b>A decisão de compartilhar é sua.</b><br />A autenticação acontece no banco. O Zelo não pede sua senha bancária.</p></div></div></div>
      <OpenFinanceJourney />
      <ProductCapture src="/brand/product/open-finance-demo.webp" title="Seus bancos, no mesmo lugar" initialPan={175} alt="Captura da área real de contas da Zelo com valores de demonstração: Banco Inter PJ, conta com R$ 18.450 de saldo e cartão com R$ 7.240 disponíveis de R$ 10 mil de limite, com R$ 2.760 utilizados. Nenhuma fatura recebida no exemplo." />
      <div className={x.bankingExplainers}>{DATA.map(([title,description],i)=><div key={title}><span>0{i+1}</span><h3>{title}</h3><p>{description}</p></div>)}</div>
      <div className={x.bankDistinction}><UiIcon name="wallet" /><p><b>Saldo e limite são coisas diferentes.</b> O saldo é o dinheiro da conta; o crédito disponível pertence à linha do cartão. Quando um banco não envia uma informação, ela aparece como “não informado”, sem virar zero.</p></div>
      <div className={x.bankPrivacy}><div><span>✓</span><h3>Privacidade e seus direitos</h3><p>Conheça as finalidades do tratamento de dados e os canais para solicitar acesso, correção e exclusão, conforme a legislação aplicável, incluindo a LGPD.</p><a href="/privacidade">Leia a Política de Privacidade ↗</a></div><div><span>↗</span><h3>Você pode encerrar o compartilhamento</h3><p>Consulte os consentimentos e solicite a revogação pelo caminho disponível no painel. O controle do compartilhamento continua com você.</p><a href="https://www.bcb.gov.br/estabilidadefinanceira/cliente-open-finance" target="_blank" rel="noopener noreferrer">Entenda no site do Banco Central ↗</a></div></div>
      <div className={s.bankLogos}><div><strong className={s.bankCoverageNumber}>210<span>↗</span></strong><h3>opções de conexão<br />no Open Finance.</h3><p>Bancos e instituições, com acessos para contas pessoais e empresariais.</p></div><ul>{BANKS.map(([slug,name])=><li key={slug}><div><Image src={`/brand/banks/${slug}.svg`} alt={`Logo ${name}`} width={52} height={52} unoptimized /></div><span>{name}</span></li>)}</ul><p className={s.bankCoverageNote}>Catálogo Polp/Celcoin consultado em 18/10/2026. A contagem inclui acessos PF e PJ que podem pertencer à mesma instituição. A disponibilidade de cada conexão varia; confira as opções na sua conta. <a href="https://api.polp.com.br/api/v2/institutions" target="_blank" rel="noopener noreferrer">Ver fonte ↗</a></p></div>
      <div className={s.bankHowHeader}><h3>Como a conexão funciona</h3><p>O compartilhamento começa com a sua autorização.</p></div>
      <ol className={s.bankSteps}>
        <li><span>01</span><h3>Escolha o banco no painel</h3><p>Abra <b>Contas → Conectar banco</b>. Use Pessoal para contas PF e o espaço Empresa para contas PJ, conforme o acesso disponível na sua conta.</p></li>
        <li><span>02</span><h3>Confira e autorize no banco</h3><p>Revise as informações e permissões. A conexão usa a Polp com infraestrutura Celcoin, e a autenticação acontece na instituição. <b>O Zelo não pede sua senha bancária.</b></p></li>
        <li><span>03</span><h3>Acompanhe os dados recebidos</h3><p>Depois da confirmação, consulte no painel ou no WhatsApp vinculado à conta. Acompanhe o estado da conexão e gerencie as permissões pelo caminho disponível no painel.</p></li>
      </ol>
      <div className={s.bankAvailability}><UiIcon name="wallet" /><p>Open Finance para contas bancárias do Brasil, conforme disponibilidade na sua conta, plano e instituição. Produtos, histórico, campos e atualização variam conforme os dados compartilhados. Uma informação não enviada aparece como “não informado”; ela não é tratada como zero. Você pode solicitar a revogação do compartilhamento em Conexões e permissões.</p></div>
    </div>
  </section>;
}
