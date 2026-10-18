"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import ScrollStory from "@/components/landing/ScrollStory";
import StoryVisual from "@/components/landing/StoryVisuals";
import s from "@/components/landing/landing.module.css";
import { BRAZIL_CHECKOUT, checkoutUrlWithLandingParams } from "@/lib/checkout-markets";

const heading = localFont({ src: "./fonts/plus-jakarta-sans-latin.woff2", weight: "600 800", style: "normal", display: "swap", variable: "--font-heading", fallback: ["Arial", "sans-serif"] });
const NAV = [["apresentacao", "A equipe Zelo"], ["recursos", "Recursos"], ["espacos", "Pessoal e empresas"], ["planos", "Planos"]] as const;
const MODULES: { icon: UiIconName; title: string; description: string }[] = [
  { icon: "document", title: "Faturas e planilhas", description: "Envie PDF, foto, CSV ou Excel. Confira os lançamentos identificados e revise antes de confirmar a importação." },
  { icon: "repeat", title: "Parcelas e recorrências", description: "Consulte parcelas previstas, assinaturas e lançamentos recorrentes para se planejar melhor." },
  { icon: "task", title: "Tarefas", description: "Transforme pendências em tarefas com prazo, prioridade e acompanhamento de conclusão." },
  { icon: "bell", title: "Lembretes", description: "Organize avisos pontuais ou recorrentes e receba o lembrete no momento programado." },
  { icon: "folder", title: "Drive inteligente", description: "Guarde arquivos, organize documentos e procure pelo que precisa descrevendo com suas palavras." },
  { icon: "target", title: "Metas", description: "Defina o objetivo, o valor e o prazo. Acompanhe o progresso de cada conquista." },
  { icon: "client", title: "Clientes", description: "Mantenha contatos, informações comerciais e observações do negócio sempre à mão." },
  { icon: "users", title: "Funcionários", description: "Organize os dados da equipe, cargos e salários dentro do espaço da empresa." },
  { icon: "cart", title: "Supermercado", description: "Monte listas, acompanhe itens e preços e consulte as compras registradas com suas despesas vinculadas." },
  { icon: "car", title: "Veículos", description: "Reúna combustível, manutenção, seguro e quilometragem dos veículos pessoais ou da empresa." },
  { icon: "person", title: "Contatos", description: "Encontre as pessoas e as informações que fazem parte da sua rotina, pelo painel e pela conversa." },
  { icon: "search", title: "Pesquisas no WhatsApp", description: "Peça pesquisas de informações públicas, comparações de preços e buscas de produtos e locais pela conversa." },
];
const PLANS = [
  { id: "monthly", name: "Mensal", prefix: "", price: "47", cents: ",00", suffix: "/mês", total: "Pagamento mensal", value: 47, badge: "" },
  { id: "semiannual", name: "Semestral", prefix: "6x", price: "36", cents: ",96", suffix: "", total: "ou R$ 197,00 à vista", value: 197, badge: "Mais popular" },
  { id: "annual", name: "Anual", prefix: "12x", price: "30", cents: ",72", suffix: "", total: "ou R$ 297,00 à vista", value: 297, badge: "Melhor valor" },
] as const;
const FAQS = [
  ["Preciso instalar outro aplicativo?", "O dia a dia acontece na conversa com o Zelo no WhatsApp. Você também conta com um painel web para visualizar, consultar e organizar suas informações pelo celular ou computador."],
  ["Como funciona a conexão com bancos e cartões?", "Você autoriza a conexão disponível no painel. O Zelo organiza os dados recebidos das instituições para consulta de contas, movimentações, cartões e outros recursos disponíveis. As informações e a atualização dependem da instituição e da conexão; um campo ausente não é tratado como zero."],
  ["Posso separar minha vida pessoal de mais de uma empresa?", "Sim. O Zelo possui o espaço Pessoal e espaços para suas empresas. Selecione o destino dos registros e configure as conexões Google de cada espaço, mantendo as informações no contexto correspondente."],
  ["O Zelo funciona com Google Agenda e Google Meet?", "Sim. Conecte a conta Google ao espaço escolhido para usar a integração de agenda e os recursos de reunião. Você pode pedir a criação de um link do Google Meet e organizar o compromisso. A conexão depende da sua autorização."],
  ["Ele grava reuniões ou gera atas sozinho?", "Para organizar um resumo, decisões e tarefas de uma reunião, envie ao Zelo o conteúdo por texto ou áudio. A criação do link do Google Meet não significa que o Zelo grava ou transcreve automaticamente a reunião."],
  ["Posso usar com minha família, sócios ou equipe?", "Sim. Vincule as pessoas à conta para que cada uma use o próprio número de WhatsApp, conforme os acessos disponíveis. Os registros ficam organizados no contexto pessoal ou empresarial correspondente."],
  ["A emissão de nota fiscal já está disponível?", "O módulo permite cadastrar dados fiscais e serviços e preparar rascunhos de NFS-e. A emissão direta e o PDF oficial ainda aguardam homologação e configuração do emissor. Um rascunho não é uma nota fiscal emitida."],
  ["Existe teste grátis? Como funciona a garantia?", "A oferta desta página é uma assinatura paga, com compra pela Hotmart e 7 dias de garantia na primeira compra. Escolha o período de pagamento e confira todas as condições no checkout antes de concluir."],
] as const;

function Resources() {
  return <section id="recursos" className={s.lightSection}><div className={s.sectionInner}>
    <div className={s.sectionIntro}><p className={s.eyebrow}>ALÉM DA CONVERSA</p><h2>Uma equipe no WhatsApp.<br />Uma visão completa no painel.</h2><p>O que você pede na conversa encontra seu lugar. Depois, consulte os detalhes, acompanhe os números e veja o conjunto.</p></div>
    <div className={s.featureRow} id="financas">
      <div className={s.featureCopy}><p className={s.eyebrow}>FINANÇAS COM MAIS CLAREZA</p><h2>Entenda seu dinheiro.<br />Planeje o que vem.</h2><p>Registre receitas e despesas por mensagem e acompanhe contas, cartões e movimentações recebidas das suas conexões bancárias. Seu financeiro fica acessível no painel e na conversa.</p><ul>{["Saldos, movimentações e categorias", "Cartões, faturas e parcelas previstas", "Investimentos, empréstimos e financiamentos recebidos", "Filtros por período, conta e espaço"].map(item => <li key={item}>{item}</li>)}</ul></div>
      <div className={s.featureVisual} role="img" aria-label="Exemplo ilustrativo do painel financeiro"><div className={s.visualLayer} aria-hidden="true"><StoryVisual scene={2} /></div></div>
    </div>
    <div className={s.featureRow} id="agenda">
      <div className={s.featureCopy}><p className={s.eyebrow}>AGENDA, TAREFAS E LEMBRETES</p><h2>Seu próximo compromisso<br />já tem lugar.</h2><p>Peça para organizar um compromisso, criar o link de uma reunião ou lembrar de uma tarefa. Conecte o Google Agenda no espaço pessoal ou na empresa escolhida.</p><ul>{["Integração com Google Agenda", "Criação de links do Google Meet", "Tarefas com prazo e prioridade", "Lembretes pontuais e recorrentes"].map(item => <li key={item}>{item}</li>)}</ul></div>
      <div className={s.featureVisual} role="img" aria-label="Exemplo ilustrativo de compromisso com lembrete"><div className={s.visualLayer} aria-hidden="true"><StoryVisual scene={4} /></div></div>
    </div>
    <div className={s.moduleHeader}><h3>Os detalhes também ficam em ordem.</h3><p>Pelo WhatsApp e no seu painel.</p></div>
    <div className={s.moduleGrid}>{MODULES.map(item => <article key={item.title} id={item.icon === "folder" ? "drive" : item.icon === "document" ? "fatura" : undefined} className={s.module}><UiIcon name={item.icon} /><h3>{item.title}</h3><p>{item.description}</p></article>)}</div>
    <aside className={s.fiscalNote}><UiIcon name="document" /><div><b>Preparação fiscal para empresas · emissão em preparação</b><p>Cadastre os dados fiscais e serviços e prepare rascunhos de NFS-e. A emissão direta e o PDF oficial ainda aguardam homologação e configuração do emissor.</p></div></aside>
  </div></section>;
}

function Spaces() {
  return <section id="espacos" className={s.spaces}><span id="modo" /><div className={s.spacesInner}><div className={s.spacesCopy}><p className={s.eyebrow}>UMA CONTA. OS ESPAÇOS CERTOS.</p><h2>A vida tem várias partes.<br />A organização acompanha.</h2><p>Cuide de você, da casa e dos negócios com clareza sobre o que pertence a cada um. Escolha o espaço e convide as pessoas que fazem parte dele.</p></div><div className={s.spaceList}>
    <div className={s.spaceItem}><UiIcon name="home" /><div><b>Seu espaço pessoal</b><p>Finanças da casa, compras de mercado, contatos, metas, documentos e compromissos.</p></div></div>
    <div className={s.spaceItem}><UiIcon name="business" /><div><b>Cada empresa no seu espaço</b><p>Clientes, equipe, financeiro, arquivos e integrações organizados por empresa.</p></div></div>
    <div className={s.spaceItem}><UiIcon name="users" /><div><b>Organização compartilhada</b><p>Família, sócios e equipe usam seus próprios números de WhatsApp para colaborar.</p></div></div>
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
      <a href="#apresentacao" aria-label="Zelo, início"><Image src="/brand/zelo-wordmark-light.png" alt="Zelo — Gestão inteligente" width={640} height={293} className={s.logo} priority /></a>
      <nav className={s.nav} aria-label="Navegação principal">{NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      <div className={s.headerActions}><Link className={s.login} href="/login">Entrar</Link><a className={s.navCta} href="#planos">Ver planos ↗</a><button className={s.menuButton} type="button" aria-expanded={menuOpen} aria-controls="menu-movel" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? "×" : "≡"}</button></div>
    </header>
    {menuOpen && <nav id="menu-movel" className={s.mobileNav} aria-label="Navegação móvel">{NAV.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}<Link href="/login">Entrar na minha conta</Link></nav>}
    <main><ScrollStory />
      <div className={s.trust}><span><UiIcon name="spark" />Converse pelo WhatsApp</span><span><UiIcon name="home" />Pessoal e empresas separados</span><span><UiIcon name="finance" />Painel web incluso</span></div>
      <Resources /><Spaces /><Plans />
      <section className={s.faq} id="duvidas"><div className={`${s.sectionInner} ${s.faqGrid}`}><div className={s.sectionIntro}><p className={s.eyebrow}>PODE PERGUNTAR</p><h2>Vamos deixar<br />tudo claro.</h2><p>Mais detalhes para você começar com segurança.</p></div><div>{FAQS.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
      <section className={s.closing}><h2>Organização começa<br />com uma conversa.</h2><p>Conheça o Zelo e encontre mais clareza para cuidar do seu dia.</p><a href="#planos" className={s.primaryButton}>Quero meu Zelo <UiIcon name="arrow" /></a></section>
    </main>
    <footer className={s.footer}><div className={s.footerTop}><div><Image src="/brand/zelo-wordmark-light.png" alt="Zelo" width={640} height={293} className={s.logo} /><p>Gestão inteligente, direto no WhatsApp.</p></div><nav className={s.footerLinks} aria-label="Rodapé"><a href="#recursos">Recursos</a><a href="#planos">Planos</a><Link href="/login">Entrar</Link><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos de uso</Link></nav></div><div className={s.copyright}><span>© {new Date().getFullYear()} Zelo. Todos os direitos reservados.</span><a href="mailto:contato@zelogestaointeligente.com.br">contato@zelogestaointeligente.com.br</a></div></footer>
  </div>;
}
