"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";

const heading = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-heading" });

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ── WhatsApp mock — moldura + header, reutilizado em várias seções ── */
function WhatsAppMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[320px] mx-auto rounded-[2rem] border-4 border-slate-900 bg-slate-900 shadow-2xl overflow-hidden">
      <div className="bg-[#0b141a] px-3 pt-2 pb-1 flex items-center justify-between">
        <span className="text-[10px] text-slate-300 font-medium">17:13</span>
        <div className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-slate-500" />
          <span className="w-3 h-2 rounded-sm bg-slate-500" />
          <span className="w-4 h-2 rounded-sm bg-slate-300" />
        </div>
      </div>
      <div className="bg-[#005c4b] px-3 py-2.5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
          <Image src="/brand/zelo-icon.png" alt="" width={22} height={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight">Zelo</p>
          <p className="text-emerald-200 text-[10px] leading-tight">online agora</p>
        </div>
        <div className="flex items-center gap-3 text-white/80 text-sm">
          <span>📹</span>
          <span>📞</span>
        </div>
      </div>
      <div
        className="px-2.5 py-3 space-y-2 min-h-[380px]"
        style={{ background: "#0b141a linear-gradient(180deg,#111b21,#0b141a)" }}
      >
        {children}
      </div>
      <div className="bg-[#1f2c34] px-2.5 py-2 flex items-center gap-2">
        <span className="text-slate-400 text-lg leading-none">＋</span>
        <div className="flex-1 bg-[#2a3942] rounded-full px-3 py-1.5 text-[11px] text-slate-400">Zelo</div>
        <span className="text-slate-400">🎙️</span>
      </div>
    </div>
  );
}

function Bubble({ from = "bot", tags, children, time = "20:40" }: { from?: "bot" | "user"; tags?: string[]; children: React.ReactNode; time?: string }) {
  const isUser = from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[12.5px] leading-snug ${isUser ? "bg-[#005c4b] text-white rounded-tr-sm" : "bg-[#1f2c34] text-slate-100 rounded-tl-sm"}`}>
        {children}
        {tags && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tags.map(t => (
              <span key={t} className="text-[9px] bg-emerald-500/15 text-emerald-300 rounded-full px-2 py-0.5 font-medium">{t}</span>
            ))}
          </div>
        )}
        <p className={`text-[9px] mt-1 ${isUser ? "text-emerald-100/70" : "text-slate-400"} text-right`}>{time}</p>
      </div>
    </div>
  );
}

/* ── Seção de feature com texto de um lado e visual do outro ── */
function Feature({
  eyebrow, title, desc, bullets, reverse, dark, visual,
}: {
  eyebrow: string; title: React.ReactNode; desc: string; bullets: string[]; reverse?: boolean; dark?: boolean; visual: React.ReactNode;
}) {
  return (
    <section className={dark ? "bg-slate-950" : "bg-white"}>
      <div className={`max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold px-3 py-1.5">
            {eyebrow}
          </span>
          <h2 className={`${heading.className} text-3xl sm:text-[2.15rem] font-extrabold mt-4 leading-tight ${dark ? "text-white" : "text-slate-900"}`}>
            {title}
          </h2>
          <p className={`mt-4 text-[15px] leading-relaxed ${dark ? "text-slate-400" : "text-slate-500"}`}>{desc}</p>
          <ul className="mt-5 space-y-2.5">
            {bullets.map(b => (
              <li key={b} className={`flex items-start gap-2.5 text-sm ${dark ? "text-slate-200" : "text-slate-700"}`}>
                <span className="mt-0.5 w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[9px] shrink-0">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div>{visual}</div>
      </div>
    </section>
  );
}

function DashCard({ title, value, sub, color = "emerald" }: { title: string; value: string; sub: string; color?: "emerald" | "amber" | "red" }) {
  const colors = { emerald: "text-emerald-600", amber: "text-amber-600", red: "text-red-500" }[color];
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{title}</p>
      <p className={`text-xl font-extrabold mt-1 ${colors}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

const FAQS = [
  { q: "O que é o Zelo e como ele funciona?", a: "O Zelo é um assistente pessoal por IA que vive no seu WhatsApp. Você fala, digita ou manda foto do que precisa registrar — finanças, compromissos, tarefas — e ele organiza tudo automaticamente, com um painel web pra você acompanhar sempre que quiser." },
  { q: "Preciso instalar algum aplicativo?", a: "Não. Todo o dia a dia acontece no seu WhatsApp normal, sem instalar nada. O painel web é opcional, pra quando você quiser uma visão mais completa." },
  { q: "Como funciona a importação da fatura do cartão?", a: "Envie o PDF da fatura pelo WhatsApp (ou pelo painel) e o Zelo lê cada lançamento sozinho, categoriza automaticamente e avisa quando algum gasto já foi registrado antes — assim você nunca duplica uma compra." },
  { q: "Posso compartilhar minha conta com outras pessoas?", a: "Sim. Você pode vincular o número de família, sócios ou da sua equipe à mesma conta — cada um registra pelo próprio WhatsApp e tudo cai no mesmo painel." },
  { q: "O que acontece com minhas reuniões do Google Meet?", a: "Você pode pedir pro Zelo criar o link da reunião, chamar os participantes pelo WhatsApp e, quando terminar, ele gera automaticamente uma ata com os principais pontos discutidos." },
  { q: "Como funciona o Drive Inteligente?", a: "Mande qualquer arquivo pelo WhatsApp e o Zelo guarda na pasta certa sozinho. Depois, é só descrever o que procura — \"ache o comprovante do mecânico\" — que ele encontra pra você." },
  { q: "Meus dados estão seguros?", a: "Sim. Seus dados ficam vinculados à sua conta e nunca são compartilhados entre usuários diferentes — cada família, sócio ou equipe só enxerga a própria informação." },
  { q: "Como funciona o período de teste?", a: "Você começa com 14 dias grátis, sem precisar de cartão de crédito, com acesso completo a todas as funções." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-slate-950 py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold px-3 py-1.5">Tire suas dúvidas</span>
          <h2 className={`${heading.className} text-3xl sm:text-4xl font-extrabold text-white mt-4`}>Perguntas frequentes</h2>
          <p className="text-slate-400 mt-3 text-sm">Tudo o que você precisa saber sobre o Zelo antes de começar.</p>
        </div>
        <div className="space-y-2.5">
          {FAQS.map((f, i) => (
            <div key={f.q} className="rounded-xl bg-white/[0.04] border border-white/10 overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-slate-100 hover:bg-white/[0.03] transition">
                {f.q}
                <span className={`shrink-0 w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-xs transition-transform ${open === i ? "rotate-45" : ""}`}>+</span>
              </button>
              {open === i && <p className="px-5 pb-4 text-sm text-slate-400 leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className={heading.variable}>
      {/* ── NAV ── */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={640} height={293} className="h-7 w-auto" priority />
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-300">
            <a href="#financas" className="hover:text-white transition">Finanças</a>
            <a href="#agenda" className="hover:text-white transition">Agenda</a>
            <a href="#drive" className="hover:text-white transition">Drive</a>
            <a href="#fatura" className="hover:text-white transition">Fatura de cartão</a>
            <a href="#planos" className="hover:text-white transition">Planos</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden sm:block text-sm text-slate-300 hover:text-white transition">Entrar</Link>
            <Link href="/cadastro" className="rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 text-sm font-bold px-4 py-2.5 hover:opacity-90 transition">
              Começar agora →
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative bg-slate-950 overflow-hidden">
        <div className="pointer-events-none absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-emerald-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute top-10 -right-32 w-[28rem] h-[28rem] rounded-full bg-teal-500/15 blur-[120px]" />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 grid md:grid-cols-2 gap-14 items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> IA no WhatsApp para sua rotina
            </span>
            <h1 className={`${heading.className} text-4xl sm:text-5xl font-extrabold text-white mt-5 leading-[1.1]`}>
              Sua rotina organizada,{" "}
              <span className="bg-gradient-to-br from-emerald-400 to-teal-400 bg-clip-text text-transparent">direto no WhatsApp.</span>
            </h1>
            <p className="text-slate-400 mt-5 text-[15px] leading-relaxed max-w-md">
              Finanças, agenda, tarefas, veículos e documentos. Organizados por IA, sem sair da conversa que você já usa todos os dias.
            </p>
            <div className="mt-7 flex items-center gap-4">
              <Link href="/cadastro" className="rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 text-sm font-bold px-6 py-3.5 hover:opacity-90 transition shadow-lg shadow-emerald-500/10">
                Começar agora →
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
              <span>🎙️ Registre por áudio</span>
              <span>⚡ Consulte em segundos</span>
              <span>📋 Organize tudo no painel</span>
            </div>
          </div>

          <WhatsAppMock>
            <Bubble from="user" time="20:40">Bom dia, organiza meu dia?</Bubble>
            <Bubble time="20:40">Claro! Vou cuidar da sua <b>agenda</b>, <b>finanças</b> e prioridades em um só lugar.</Bubble>
            <Bubble time="20:40" tags={["Resumo", "Rotina"]}>
              📆 Passando rapidinho:{"\n"}Vi <b>R$ 87,40</b> no cartão hoje.{"\n\n"}Já categorizei, salvei no painel e deixei tudo bonito por lá ✨
            </Bubble>
            <Bubble from="user" time="20:41">Marca reunião amanhã 10h com a Carla</Bubble>
            <Bubble time="20:41" tags={["Google Agenda", "Lembrete criado"]}>Marcado! ✅ Vou te lembrar 15 min antes.</Bubble>
          </WhatsAppMock>
        </div>

        {/* trust strip */}
        <div className="relative border-t border-white/5 bg-slate-950/60">
          <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-xs text-slate-500">
            <span>🔒 Dados isolados por conta</span>
            <span>🤖 IA Google Gemini</span>
            <span>📱 100% pelo WhatsApp</span>
            <span>🌐 Painel web incluso</span>
          </div>
        </div>
      </section>

      {/* ── FINANÇAS ── */}
      <div id="financas">
        <Feature
          eyebrow="📋 Controle Financeiro"
          title="Anote seus gastos por áudio, texto ou foto."
          desc="Registre cada despesa ou receita em segundos. O Zelo ouve seus áudios, entende sua fala natural e categoriza tudo automaticamente — sem planilha, sem digitação."
          bullets={["Consulte qualquer gasto pelo WhatsApp", "Seus gastos já chegam categorizados", "Resumo do dia direto pra você", "Receitas e despesas, pessoal ou empresa"]}
          visual={
            <WhatsAppMock>
              <Bubble from="user" time="09:12">🎙️ 0:08</Bubble>
              <Bubble time="09:12">Entendi! Registrei:</Bubble>
              <Bubble time="09:12" tags={["Alimentação", "Categorizado"]}>
                💸 <b>Despesa registrada!</b>{"\n"}Mercado Extra — {fmt(184.9)}{"\n\n"}📊 Saldo pessoal: {fmt(3241.5)}
              </Bubble>
              <Bubble from="user" time="09:14">📷 nota-farmacia.jpg</Bubble>
              <Bubble time="09:14" tags={["Saúde"]}>💊 Anotado: Farmácia São João — {fmt(58.3)}</Bubble>
            </WhatsAppMock>
          }
        />
      </div>

      <Feature
        eyebrow="📊 Seu Painel Financeiro"
        reverse
        title="Seu dinheiro organizado em um só painel."
        desc="Seus gastos, compromissos e metas organizados num painel completo. Você sempre sabe o que aconteceu, o que está pendente e o que vem pela frente."
        bullets={["Veja seus gastos separados por categoria", "Contas recorrentes e parceladas sob controle", "Defina metas e acompanhe se está cumprindo", "Exporte seus dados quando precisar"]}
        visual={
          <div className="max-w-sm mx-auto space-y-3">
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-xl">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Saldo pessoal · julho</p>
              <p className="text-3xl font-extrabold mt-1">{fmt(3241.5)}</p>
              <div className="flex gap-2 mt-3">
                <span className="text-[10px] bg-emerald-500/15 text-emerald-300 rounded-full px-2.5 py-1">+{fmt(5800)} receitas</span>
                <span className="text-[10px] bg-red-500/10 text-red-300 rounded-full px-2.5 py-1">-{fmt(2558.5)} despesas</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DashCard title="Meta: Viagem" value="62%" sub={`${fmt(3100)} de ${fmt(5000)}`} />
              <DashCard title="Cartão a pagar" value={fmt(1420)} sub="vence em 6 dias" color="amber" />
            </div>
          </div>
        }
      />

      {/* ── FATURA DE CARTÃO (destaque) ── */}
      <section id="fatura" className="bg-slate-950 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold px-3 py-1.5">💳 Fatura do Cartão</span>
            <h2 className={`${heading.className} text-3xl sm:text-4xl font-extrabold text-white mt-4`}>Chega de digitar cada gasto do cartão.</h2>
            <p className="text-slate-400 mt-3 text-sm leading-relaxed">Envie a fatura em PDF pelo WhatsApp ou pelo painel. O Zelo lê cada lançamento sozinho, categoriza automaticamente e nunca registra o mesmo gasto duas vezes.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-3">Fatura analisada</p>
              <p className="text-white font-bold text-lg">34 lançamentos</p>
              <p className="text-xs text-slate-500 mt-1">encontrados no PDF</p>
            </div>
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold mb-3">✅ Novos</p>
              <p className="text-emerald-300 font-bold text-lg">29 lançamentos</p>
              <p className="text-xs text-emerald-400/70 mt-1">prontos pra importar</p>
            </div>
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-5">
              <p className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold mb-3">♻️ Duplicados</p>
              <p className="text-amber-300 font-bold text-lg">5 lançamentos</p>
              <p className="text-xs text-amber-400/70 mt-1">já estavam registrados — ignorados</p>
            </div>
          </div>
          <div className="text-center mt-10">
            <Link href="/cadastro" className="inline-block rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 text-sm font-bold px-6 py-3.5 hover:opacity-90 transition">
              Importar minha fatura →
            </Link>
          </div>
        </div>
      </section>

      {/* ── AGENDA ── */}
      <div id="agenda">
        <Feature
          eyebrow="📅 Agenda Inteligente"
          title="Nunca mais esqueça um compromisso."
          desc="Tenha lembretes e resumos diários. Registre compromissos no WhatsApp falando do seu jeito: o Zelo entende e organiza sua rotina. Tudo sincronizado com o Google Agenda."
          bullets={["Consulte sua agenda pelo WhatsApp", "Marque tarefas do dia como feitas", "Sincronizado com o Google Agenda", "Lembretes automáticos, sem precisar pedir"]}
          visual={
            <WhatsAppMock>
              <Bubble from="user" time="20:40">Marcar reunião hoje às 14h com o time todo</Bubble>
              <Bubble time="20:40" tags={["Google Agenda"]}>A reunião com o time todo está marcada para hoje às 14h! Vou te enviar um lembrete às 12h.</Bubble>
              <Bubble time="20:40">Se precisar de mais alguma coisa, estou por aqui! 🌿</Bubble>
            </WhatsAppMock>
          }
        />
      </div>

      <Feature
        eyebrow="🎥 Reuniões e Atas"
        reverse
        title="Reuniões marcadas e resumidas sozinhas."
        desc="Peça pro Zelo criar o link do Google Meet, convocar os participantes pelo WhatsApp e, quando a reunião terminar, ele mesmo gera a ata com os pontos principais."
        bullets={["Crie a reunião só falando com o Zelo", "Participantes convocados pelo WhatsApp", "Ata gerada automaticamente ao final", "Tudo fica salvo e fácil de encontrar depois"]}
        visual={
          <div className="max-w-sm mx-auto space-y-3">
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-lg">📹</span>
              <div>
                <p className="text-sm font-semibold text-slate-800">Reunião — Time Comercial</p>
                <p className="text-xs text-slate-400">14:00 · Google Meet</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-800 mb-1.5">📝 Ata gerada</p>
              <p className="text-xs text-slate-500 leading-relaxed">Decidido: fechamento da proposta até sexta. Ação: Carla envia contrato revisado. Próxima reunião: quinta-feira.</p>
            </div>
          </div>
        }
      />

      {/* ── GRID DE MÓDULOS SECUNDÁRIOS ── */}
      <section className="bg-white py-24 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold px-3 py-1.5">✨ Muito mais</span>
            <h2 className={`${heading.className} text-3xl font-extrabold text-slate-900 mt-4`}>Muito mais que finanças.</h2>
            <p className="text-slate-500 mt-3 text-sm">Tudo o que organiza sua rotina, em um só assistente.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: "🎯", title: "Metas", desc: "Defina objetivos com prazo e acompanhe quanto falta." },
              { icon: "🚗", title: "Veículos", desc: "Combustível, manutenção e quilometragem, tudo num lugar." },
              { icon: "👥", title: "Funcionários", desc: "Cargos, salários e a folha da sua equipe organizados." },
              { icon: "🛒", title: "Lista de mercado", desc: "Compras por categoria, preço e loja, direto pelo WhatsApp." },
            ].map(c => (
              <div key={c.title} className="rounded-2xl border border-slate-100 p-6 hover:border-emerald-200 hover:shadow-sm transition">
                <span className="text-2xl">{c.icon}</span>
                <p className="font-bold text-slate-900 mt-3">{c.title}</p>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTA COMPARTILHADA ── */}
      <Feature
        eyebrow="👨‍👩‍👧 Conta Compartilhada"
        title="Convide quem precisar, sem senha."
        desc="Compartilhe o Zelo com sua família, sócios ou equipe. Cada pessoa registra pelo próprio WhatsApp, e você mantém visibilidade total sobre tudo num painel só."
        bullets={["Casais registram gastos em uma conta única", "Sócios lançam despesas e receitas no mesmo lugar", "Sua equipe alimenta o sistema, com segurança"]}
        visual={
          <div className="relative w-full max-w-sm mx-auto aspect-square flex items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl z-10">
              <Image src="/brand/zelo-icon.png" alt="" width={40} height={40} />
            </div>
            {[
              { label: "Ana · Sócia", pos: "top-2 left-4" },
              { label: "Carla · Família", pos: "top-1/3 right-0" },
              { label: "Pedro · Esposo", pos: "bottom-2 left-8" },
              { label: "Marina · Equipe", pos: "bottom-6 right-6" },
            ].map(p => (
              <div key={p.label} className={`absolute ${p.pos} bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2 text-xs font-medium text-slate-600`}>
                {p.label}
              </div>
            ))}
          </div>
        }
      />

      {/* ── DRIVE ── */}
      <div id="drive">
        <Feature
          eyebrow="📁 Drive Inteligente"
          reverse
          title="Seus documentos guardados. Encontrados por IA."
          desc="Envie qualquer arquivo pelo WhatsApp e tenha tudo salvo e organizado. Quando precisar, é só descrever com suas palavras que o Zelo encontra pra você."
          bullets={["Envie arquivos direto pelo WhatsApp", "O Zelo organiza nas pastas certas sozinho", "Ache qualquer arquivo só descrevendo ele"]}
          visual={
            <WhatsAppMock>
              <Bubble from="user" time="10:02">📄 comprovante_mecanico.pdf{"\n"}Salva isso na pasta de comprovantes</Bubble>
              <Bubble time="10:02" tags={["Comprovantes"]}>Pronto! Salvei na pasta Comprovantes ✅</Bubble>
              <Bubble from="user" time="10:20">Ache o comprovante que fiz pro mecânico esse ano</Bubble>
              <Bubble time="10:20">Achei! Aqui está 👇{"\n"}📄 comprovante_mecanico.pdf</Bubble>
            </WhatsAppMock>
          }
        />
      </div>

      {/* ── CTA banner ── */}
      <section className="bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-900 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className={`${heading.className} text-3xl sm:text-4xl font-extrabold text-white`}>Sua rotina, sob controle.</h2>
          <p className="text-slate-300 mt-2">Onde quer que você esteja — é só abrir o WhatsApp.</p>
          <Link href="/cadastro" className="inline-block mt-7 rounded-xl bg-white text-slate-900 text-sm font-bold px-7 py-3.5 hover:bg-slate-100 transition">
            Começar agora →
          </Link>
        </div>
      </section>

      {/* ── PLANOS ── */}
      <section id="planos" className="bg-slate-50 py-24">
        <div className="max-w-md mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-semibold px-3 py-1.5">🌿 Experimente sem risco</span>
          <h2 className={`${heading.className} text-3xl font-extrabold text-slate-900 mt-4`}>Comece grátis por 14 dias.</h2>
          <p className="text-slate-500 mt-2 text-sm">Sem cartão de crédito. Acesso completo a todas as funções, desde o primeiro dia.</p>

          <div className="mt-8 rounded-3xl bg-white border border-slate-200 shadow-sm p-7 text-left">
            <p className="font-bold text-slate-900 mb-4">Tudo incluso no período de teste:</p>
            <ul className="space-y-2.5">
              {["Zelo no seu WhatsApp", "Painel completo pelo navegador", "Finanças, agenda e metas", "Importação de fatura de cartão", "Drive inteligente com IA", "Conta compartilhada com sua equipe ou família"].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-700">
                  <span className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[9px] shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/cadastro" className="mt-6 block text-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-sm font-bold px-6 py-3.5 hover:opacity-90 transition">
              Criar minha conta →
            </Link>
          </div>
        </div>
      </section>

      <Faq />

      {/* ── FOOTER ── */}
      <footer className="bg-slate-950 border-t border-white/5 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center sm:items-start gap-1.5">
            <Image src="/brand/zelo-wordmark.png" alt="Zelo" width={640} height={293} className="h-6 w-auto" />
            <p className="text-slate-500 text-xs">Gestão inteligente, direto no WhatsApp.</p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <a href="#financas" className="hover:text-white transition">Finanças</a>
            <a href="#agenda" className="hover:text-white transition">Agenda</a>
            <a href="#drive" className="hover:text-white transition">Drive</a>
            <a href="#fatura" className="hover:text-white transition">Fatura de cartão</a>
            <Link href="/login" className="hover:text-white transition">Login</Link>
            <Link href="/cadastro" className="hover:text-white transition">Criar conta</Link>
          </nav>
        </div>
        <p className="text-center text-slate-600 text-[11px] mt-8">© {new Date().getFullYear()} Zelo. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
