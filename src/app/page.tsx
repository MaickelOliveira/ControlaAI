"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import UiIcon from "@/components/UiIcon";
import ScrollStory from "@/components/landing/ScrollStory";
import ProductHero from "@/components/landing/ProductHero";
import FunctionsGuide from "@/components/landing/FunctionsGuide";
import OpenFinanceSection from "@/components/landing/OpenFinanceSection";
import StoryVisual from "@/components/landing/StoryVisuals";
import s from "@/components/landing/landing.module.css";
import { BRAZIL_CHECKOUT, checkoutUrlWithLandingParams } from "@/lib/checkout-markets";

const heading = localFont({ src: "./fonts/plus-jakarta-sans-latin.woff2", weight: "600 800", style: "normal", display: "swap", variable: "--font-heading", fallback: ["Arial", "sans-serif"] });
const NAV = [["open-finance", "Open Finance"], ["recursos", "Funções"], ["espacos", "Pessoal e empresas"], ["apresentacao", "Agentes"], ["planos", "Planos"]] as const;
const PLANS = [
  { id: "monthly", name: "Mensal", prefix: "", price: "47", cents: ",00", suffix: "/mês", total: "Pagamento mensal", value: 47, badge: "" },
  { id: "semiannual", name: "Semestral", prefix: "6x", price: "36", cents: ",96", suffix: "", total: "ou R$ 197,00 à vista", value: 197, badge: "Mais popular" },
  { id: "annual", name: "Anual", prefix: "12x", price: "30", cents: ",72", suffix: "", total: "ou R$ 297,00 à vista", value: 297, badge: "Melhor valor" },
] as const;
const FAQS = [
  ["Preciso instalar outro aplicativo?", "O dia a dia acontece na conversa com o Zelo no WhatsApp. Você também conta com um painel web para visualizar, consultar e organizar suas informações pelo celular ou computador."],
  ["Como funciona o Open Finance no Zelo?", "Quando o recurso estiver disponível na sua conta, abra Contas → Conectar banco no painel. Escolha a instituição e conclua a autorização no banco, com a conexão da Celcoin. O Zelo não pede sua senha bancária. Depois, consulte os dados recebidos de contas, cartões, investimentos e operações de crédito pelo painel e pelo WhatsApp. O recurso se aplica a contas bancárias do Brasil e depende do plano, do acesso ao espaço e das informações compartilhadas pela instituição."],
  ["Posso separar minha vida pessoal de mais de uma empresa?", "Sim. O Zelo possui o espaço Pessoal e espaços para suas empresas. Selecione o destino dos registros e configure as conexões Google de cada espaço, mantendo as informações no contexto correspondente."],
  ["O Zelo funciona com Google Agenda e Google Meet?", "Sim. Conecte a conta Google ao espaço escolhido para usar a integração de agenda e os recursos de reunião. Você pode pedir a criação de um link do Google Meet e organizar o compromisso. A conexão depende da sua autorização."],
  ["Ele grava reuniões ou gera atas sozinho?", "Para organizar um resumo, decisões e tarefas de uma reunião, envie ao Zelo o conteúdo por texto ou áudio. A criação do link do Google Meet não significa que o Zelo grava ou transcreve automaticamente a reunião."],
  ["Posso usar com minha família, sócios ou equipe?", "Sim. Vincule as pessoas à conta para que cada uma use o próprio número de WhatsApp, conforme os acessos disponíveis. Os registros ficam organizados no contexto pessoal ou empresarial correspondente."],
  ["A emissão de nota fiscal já está disponível?", "O módulo permite cadastrar dados fiscais e serviços e preparar rascunhos de NFS-e. A emissão direta e o PDF oficial ainda aguardam homologação e configuração do emissor. Um rascunho não é uma nota fiscal emitida."],
  ["Existe teste grátis? Como funciona a garantia?", "A oferta desta página é uma assinatura paga, com compra pela Hotmart e 7 dias de garantia na primeira compra. Escolha o período de pagamento e confira todas as condições no checkout antes de concluir."],
] as const;

function Resources() {
  return <section id="recursos" className={s.lightSection}><div className={s.sectionInner}>
    <div className={s.sectionIntro}><p className={s.eyebrow}>ENTENDA O QUE O ZELO FAZ POR VOCÊ</p><h2>Peça do seu jeito.<br />Acompanhe cada detalhe.</h2><p>Uma despesa vira um registro financeiro. Um compromisso encontra lugar na agenda. Um arquivo fica disponível para consultar depois. Veja como cada parte funciona na prática.</p></div>
    <div className={s.featureRow} id="financas">
      <div className={s.featureCopy}><p className={s.eyebrow}>FINANÇAS COM MAIS CLAREZA</p><h2>Entenda seu dinheiro.<br />Planeje o que vem.</h2><p>Diga quanto recebeu ou gastou, a conta e o espaço do registro. Consulte por período e categoria para entender suas movimentações. Com uma conexão bancária autorizada, acompanhe também os dados disponibilizados pelas suas instituições.</p><ul>{["Registre receitas e despesas por texto, áudio ou documento", "Consulte contas, saldos, cartões, faturas e parcelas", "Acompanhe investimentos, empréstimos e financiamentos recebidos", "Filtre por período, conta, categoria e espaço"].map(item => <li key={item}>{item}</li>)}</ul><div className={s.featureExample}><span>NA PRÁTICA</span><p>“Quanto gastei no mercado este mês?”</p><small>O Zelo consulta os registros do contexto selecionado. No painel, você vê os lançamentos que compõem o período. Dados bancários e atualização dependem da instituição.</small></div></div>
      <div className={s.featureVisual} role="img" aria-label="Exemplo ilustrativo do painel financeiro"><div className={s.visualLayer} aria-hidden="true"><StoryVisual scene={2} /></div></div>
    </div>
    <div className={s.featureRow} id="agenda">
      <div className={s.featureCopy}><p className={s.eyebrow}>AGENDA, TAREFAS E LEMBRETES</p><h2>Seu próximo compromisso<br />já tem lugar.</h2><p>Informe o compromisso, a data e o horário. Conecte o Google Agenda ao espaço pessoal ou à empresa para organizar a agenda daquele contexto e peça o link do Google Meet quando precisar de uma reunião.</p><ul>{["Crie e consulte compromissos pela conversa", "Conecte a conta Google ao espaço escolhido", "Peça um link do Meet para a reunião", "Organize tarefas e lembretes junto da sua rotina"].map(item => <li key={item}>{item}</li>)}</ul><div className={s.featureExample}><span>NA PRÁTICA</span><p>“Marque uma reunião amanhã às 10h e crie o link do Meet.”</p><small>Complete os dados solicitados e acompanhe o compromisso na agenda do espaço. Para organizar uma ata ou resumo, envie o conteúdo por áudio ou texto; criar o link não grava a reunião automaticamente.</small></div></div>
      <div className={s.featureVisual} role="img" aria-label="Exemplo ilustrativo de compromisso com lembrete"><div className={s.visualLayer} aria-hidden="true"><StoryVisual scene={4} /></div></div>
    </div>
    <FunctionsGuide />
    <aside className={s.fiscalNote}><UiIcon name="document" /><div><b>Preparação fiscal para empresas · emissão em preparação</b><p>Cadastre os dados fiscais da empresa e os serviços, informe o tomador e prepare um rascunho de NFS-e para revisar. A emissão direta e o PDF oficial ainda aguardam homologação e configuração do emissor. O rascunho ajuda na preparação e não é uma nota fiscal emitida.</p></div></aside>
  </div></section>;
}

function Spaces() {
  return <section id="espacos" className={s.spaces}><span id="modo" /><div className={s.spacesInner}><div className={s.spacesCopy}><p className={s.eyebrow}>UMA CONTA. OS ESPAÇOS CERTOS.</p><h2>A vida tem várias partes.<br />A organização acompanha.</h2><p>Cuide de você, da casa e dos negócios com clareza sobre o que pertence a cada um. Escolha o espaço e convide as pessoas que fazem parte dele.</p></div><div className={s.spaceList}>
    <div className={s.spaceItem}><UiIcon name="home" /><div><b>Seu espaço pessoal</b><p>Escolha o Pessoal para organizar finanças da casa, mercado, contatos, metas, documentos e compromissos. Os registros ficam nesse contexto para você consultar depois.</p></div></div>
    <div className={s.spaceItem}><UiIcon name="business" /><div><b>Cada empresa no seu espaço</b><p>Selecione a empresa antes de registrar ou consultar. Clientes, equipe, financeiro e arquivos pertencem àquele espaço; as conexões Google também são configuradas por espaço.</p></div></div>
    <div className={s.spaceItem}><UiIcon name="users" /><div><b>Organização compartilhada</b><p>Vincule família, sócios ou equipe para que cada pessoa use o próprio número de WhatsApp, conforme os acessos disponíveis. As informações continuam no contexto pessoal ou empresarial correspondente.</p></div></div>
  </div></div></section>;
}

function Plans() {
  return <section id="planos" className={s.plans}><div className={s.sectionInner}>
    <div className={s.sectionIntro}><p className={s.eyebrow}>ESCOLHA COMO COMEÇAR</p><h2>Seu próximo passo<br />para uma rotina mais leve.</h2><p>Os mesmos recursos disponíveis em todos os períodos. Compra segura pela Hotmart e 7 dias de garantia na primeira compra.</p></div>
    <div className={s.planGrid}>{PLANS.map(plan => <article key={plan.id} className={`${s.plan} ${plan.id === "semiannual" ? s.planPopular : ""}`}>
      {plan.badge && <span className={s.planBadge}>{plan.badge}</span>}<h3>{plan.name}</h3>
      <div className={s.price}>{plan.prefix && <span>{plan.prefix}</span>}<small>R$</small><strong>{plan.price}</strong><span>{plan.cents}{plan.suffix}</span></div><p className={s.planTotal}>{plan.total}</p>
      <ul>{["Equipe virtual no WhatsApp e painel web", "Uso pessoal e empresarial", "Finanças, agenda, tarefas e documentos", "Gestão compartilhada", "Suporte prioritário"].map(item => <li key={item}>{item}</li>)}</ul>
      <a href={BRAZIL_CHECKOUT.checkoutUrls[plan.id]} onClick={event => { event.currentTarget.href = checkoutUrlWithLandingParams(BRAZIL_CHECKOUT.checkoutUrls[plan.id], window.location.search); }} data-meta-plan={plan.id} data-meta-value={plan.value} className={s.primaryButton} aria-label={`Escolher ${plan.name.toLowerCase()} — comprar pela Hotmart`}>Escolher {plan.name.toLowerCase()} <UiIcon name="arrow" /></a>
    </article>)}</div><p className={s.planFine}>Confira as condições de pagamento e parcelamento no checkout. Recursos bancários dependem das instituições conectadas e dos dados disponibilizados. A emissão direta de NFS-e permanece em preparação.</p>
  </div></section>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className={`${heading.variable} ${s.page}`}>
    <a className={s.skipLink} href="#recursos">Pular para os recursos</a>
    <header className={s.header}>
      <a href="#inicio" aria-label="Zelo, início"><Image src="/brand/zelo-wordmark-light.png" alt="Zelo — Gestão inteligente" width={640} height={293} className={s.logo} priority /></a>
      <nav className={s.nav} aria-label="Navegação principal">{NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      <div className={s.headerActions}><Link className={s.login} href="/login">Entrar</Link><a className={s.navCta} href="#planos">Ver planos ↗</a><button className={s.menuButton} type="button" aria-expanded={menuOpen} aria-controls="menu-movel" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? "×" : "≡"}</button></div>
    </header>
    {menuOpen && <nav id="menu-movel" className={s.mobileNav} aria-label="Navegação móvel">{NAV.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}<Link href="/login">Entrar na minha conta</Link></nav>}
    <main><ProductHero />
      <div className={s.trust}><span><UiIcon name="spark" />Converse pelo WhatsApp</span><span><UiIcon name="home" />Pessoal e empresas separados</span><span><UiIcon name="finance" />Painel web incluso</span></div>
      <OpenFinanceSection /><Resources /><Spaces /><ScrollStory /><Plans />
      <section className={s.faq} id="duvidas"><div className={`${s.sectionInner} ${s.faqGrid}`}><div className={s.sectionIntro}><p className={s.eyebrow}>PODE PERGUNTAR</p><h2>Vamos deixar<br />tudo claro.</h2><p>Mais detalhes para você começar com segurança.</p></div><div>{FAQS.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
      <section className={s.closing}><h2>Organização começa<br />com uma conversa.</h2><p>Conheça o Zelo e encontre mais clareza para cuidar do seu dia.</p><a href="#planos" className={s.primaryButton}>Quero meu Zelo <UiIcon name="arrow" /></a></section>
    </main>
    <footer className={s.footer}><div className={s.footerTop}><div><Image src="/brand/zelo-wordmark-light.png" alt="Zelo" width={640} height={293} className={s.logo} /><p>Gestão inteligente, direto no WhatsApp.</p></div><nav className={s.footerLinks} aria-label="Rodapé"><a href="#recursos">Recursos</a><a href="#planos">Planos</a><Link href="/login">Entrar</Link><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos de uso</Link></nav></div><div className={s.copyright}><span>© {new Date().getFullYear()} Zelo. Todos os direitos reservados.</span><a href="mailto:contato@zelogestaointeligente.com.br">contato@zelogestaointeligente.com.br</a></div></footer>
  </div>;
}
